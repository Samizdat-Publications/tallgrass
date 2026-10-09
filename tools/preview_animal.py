# Blender: render quick workbench previews of an animal npz (positions in the Tallgrass frame: +X forward, +Y up, +Z right) with its albedo.
#   blender -b --factory-startup -P tools/preview_animal.py -- <npz> <albedo.png> <out_prefix> [overlay.npz]
import bpy, sys, os, numpy as np, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
npz, albedo, out = a[0], a[1], a[2]
d = np.load(npz)
pos = d['pos']; tris = d['tris']; uv = d['uv']
# ours (x fwd, y up, z right) -> blender (x = right? keep a right-handed view): blender (X=ours x, Y=-ours z, Z=ours y)
def conv(p): return np.stack([p[:, 0], -p[:, 2], p[:, 1]], 1)
def mk(name, p, t, uvs=None, img=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in conv(p)], [], [tuple(x) for x in t])
    me.update()
    if uvs is not None:
        l = me.uv_layers.new(name='UV')
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                l.data[li].uv = tuple(uvs[vi])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for pl in me.polygons: pl.use_smooth = True
    if img:
        m = bpy.data.materials.new(name); m.use_nodes = True
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(img)
        bsdf = m.node_tree.nodes['Principled BSDF']; m.node_tree.links.new(n.outputs[0], bsdf.inputs[0])
        me.materials.append(m)
    return ob
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
ob = mk('a', pos, tris, uv, albedo if albedo != 'parts' else None)
if albedo == 'parts':
    pal = np.array([[.6,.6,.6],[1,.2,.2],[.2,1,.2],[.2,.4,1],[1,1,.2],[1,.2,1],[.2,1,1]])
    part = d['part']; wb = d['wb'] if 'wb' in d else np.zeros(len(part))
    ca = ob.data.color_attributes.new('c', 'FLOAT_COLOR', 'POINT')
    for i in range(len(part)):
        c = pal[int(part[i])] * (1 - 0.65 * wb[i])
        ca.data[i].color = (c[0], c[1], c[2], 1)
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'VERTEX' if albedo == 'parts' else 'TEXTURE'
sc.render.resolution_x = 1000; sc.render.resolution_y = 560
mn = conv(pos).min(0); mx = conv(pos).max(0)
c = Vector((mn + mx) / 2); size = float(np.linalg.norm(mx - mn))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 0.9
def shot(dirv, name):
    dv = Vector(dirv).normalized()
    cam.location = c + dv * size * 2
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.abspath(f'{out}_{name}.png')
    bpy.ops.render.render(write_still=True)
shot((0, -1, 0), 'side'); shot((1, 0, 0), 'front'); shot((0, 0, 1), 'top'); shot((1, -1, 0.5), 'q')
