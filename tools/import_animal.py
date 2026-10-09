# Blender side of the a3 animal import (stage 1). Run headless:
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/import_animal.py -- tools/animals/bison.json
# Reads a downloaded model (glb), orients it to the Tallgrass frame (faces +X, +Y up, +Z the animal's right, feet at y = 0), scales it,
# decimates a copy to a game mesh, unwraps it and bakes the source texture (albedo) and the source relief (tangent-space normal map)
# onto it, then writes a stage-1 intermediate (npz) plus the two baked images. Stage 2 (tools/label_animal.py, plain Python and numpy)
# retargets the legs onto our rig and labels the parts. Everything is explicit in the species config, so a new species is one json file.
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

cfg_path = sys.argv[sys.argv.index('--') + 1]
cfg = json.load(open(cfg_path))
ROOT = os.path.abspath(os.path.join(os.path.dirname(cfg_path), '..', '..'))
def P(p): return p if os.path.isabs(p) else os.path.join(ROOT, p)
work = P(cfg['work'])
os.makedirs(work, exist_ok=True)
TEX = int(cfg.get('tex', 1024))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=P(cfg['source']))
scene = bpy.context.scene

# rest pose for skinned sources
for o in scene.objects:
    if o.type == 'ARMATURE':
        o.data.pose_position = cfg.get('pose', 'REST')
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()

skip = set(cfg.get('exclude_objects', []))
hi_objs = []
for o in list(scene.objects):
    if o.type != 'MESH' or o.name in skip:
        continue
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    me.transform(o.matrix_world)
    no = bpy.data.objects.new(o.name + '_hi', me)
    scene.collection.objects.link(no)
    hi_objs.append(no)
for o in list(scene.objects):
    if o not in hi_objs:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in hi_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = hi_objs[0]
bpy.ops.object.join()
hi = bpy.context.view_layer.objects.active
hi.name = 'hi'
print('source tris', sum(len(p.vertices) - 2 for p in hi.data.polygons))

# ---- orient: ours = (p . F, p . U, p . R) with U = +Z (Blender up), R = F x U
F = Vector(cfg['forward']).normalized()
U = Vector(cfg.get('up', (0, 0, 1))).normalized()
R = F.cross(U)
M = Matrix((F[:], U[:], R[:]))  # rows: ours_x, ours_y, ours_z in terms of Blender coords
M4 = M.to_4x4()
def to_ours(o, mat):
    o.data.transform(mat)
    o.data.update()
to_ours(hi, M4)  # note: M is a rotation here (F, U, R orthonormal and right-handed), so winding and normals stay valid
if M.determinant() < 0:
    raise SystemExit('orientation is a reflection')
yaw = math.radians(float(cfg.get('yaw', 0)))
if yaw:
    # heading of the source in the (x, z) plane, +z toward the animal's right: x' = x c + z s, z' = -x s + z c
    c_, s_ = math.cos(yaw), math.sin(yaw)
    hi.data.transform(Matrix(((c_, 0, s_, 0), (0, 1, 0, 0), (-s_, 0, c_, 0), (0, 0, 0, 1))))
    hi.data.update()
def bbox(o):
    a = np.empty(len(o.data.vertices) * 3, dtype=np.float32)
    o.data.vertices.foreach_get('co', a)
    a = a.reshape(-1, 3)
    return a.min(0), a.max(0)
mn, mx = bbox(hi)
print('oriented bbox', mn, mx)

# ---- scale and place: height measured as max y; nose x aligned; centred in z; feet at y = 0
s = float(cfg['scale']) if 'scale' in cfg else float(cfg['height']) / float(mx[1] - mn[1])
S = Matrix.Scale(s, 4)
hi.data.transform(S)
mn, mx = bbox(hi)
nose_x = float(cfg['nose_x'])
t = Vector((nose_x - mx[0], -mn[1], -(mn[2] + mx[2]) * 0.5))
hi.data.transform(Matrix.Translation(t))
hi.data.update()
mn, mx = bbox(hi)
print('scaled', s, 'bbox', mn, mx)

# ---- decimate a copy to the game mesh
lo_me = hi.data.copy()
lo = bpy.data.objects.new('lo', lo_me)
scene.collection.objects.link(lo)
bm = bmesh.new(); bm.from_mesh(lo_me)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.to_mesh(lo_me); bm.free()
for uv in list(lo_me.uv_layers):
    lo_me.uv_layers.remove(uv)
for m in list(lo.data.materials):
    lo.data.materials.pop()
# weld the source so the collapse sees one surface
bpy.context.view_layer.objects.active = lo
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.mesh.delete_loose()
bpy.ops.object.mode_set(mode='OBJECT')
src_tris = len(lo.data.polygons)
target = int(cfg.get('tris', 8000))
dm = lo.modifiers.new('dec', 'DECIMATE')
dm.decimate_type = 'COLLAPSE'
dm.ratio = min(1.0, target / max(1, src_tris))
dm.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='dec')
print('welded tris', src_tris, 'game tris', len(lo.data.polygons))
bpy.ops.object.shade_smooth()

# ---- unwrap
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True)
bpy.context.view_layer.objects.active = lo
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(float(cfg.get('uv_angle', 70))), island_margin=float(cfg.get('uv_margin', 0.004)), area_weight=0.6)
bpy.ops.uv.pack_islands(margin=float(cfg.get('uv_margin', 0.004)))
bpy.ops.object.mode_set(mode='OBJECT')

# ---- bake albedo and normal from hi to lo
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 4
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = float(cfg.get('cage', 0.03))
scene.render.bake.max_ray_distance = float(cfg.get('ray', 0.0))
scene.render.bake.margin = int(cfg.get('bake_margin', 12))
mat = bpy.data.materials.new('bake'); mat.use_nodes = True
lo.data.materials.append(mat)
nt = mat.node_tree
node = nt.nodes.new('ShaderNodeTexImage')
nt.nodes.active = node
def bake(kind, name, **kw):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False)
    if kind == 'NORMAL':
        img.colorspace_settings.name = 'Non-Color'   # (data, not a colour: no sRGB curve on save)
    node.image = img
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True); lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.bake(type=kind, **kw)
    img.filepath_raw = os.path.join(work, name + '.png')
    img.file_format = 'PNG'
    img.save()
    print('baked', name)
    return img
bake('DIFFUSE', cfg['species'] + '_albedo', pass_filter={'COLOR'})
bake('NORMAL', cfg['species'] + '_normal', normal_space='TANGENT')

# ---- export the game mesh (loops merged by vertex + uv)
me = lo.data
me.calc_loop_triangles()
uvl = me.uv_layers.active.data
nvert = len(me.vertices)
co = np.empty(nvert * 3, dtype=np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
vmap = {}
pos, uvs, srcv = [], [], []
tris = []
for tri in me.loop_triangles:
    ids = []
    for li, vi in zip(tri.loops, tri.vertices):
        uv = uvl[li].uv
        key = (vi, round(uv[0], 5), round(uv[1], 5))
        k = vmap.get(key)
        if k is None:
            k = len(pos)
            vmap[key] = k
            pos.append(co[vi]); uvs.append((uv[0], uv[1])); srcv.append(vi)
        ids.append(k)
    tris.append(ids)
np.savez(os.path.join(work, 'stage1.npz'), pos=np.array(pos, np.float32), uv=np.array(uvs, np.float32), src=np.array(srcv, np.int32), tris=np.array(tris, np.int32))
# also keep a decimated, textured preview for a quick look in Blender if needed
print('exported verts', len(pos), 'tris', len(tris), 'to', work)
