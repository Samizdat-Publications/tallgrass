"""Species list of a batch CSV, read from its pop_* header columns (the sim's species registry decides the set)."""
import csv


def species_from_header(path):
    """Species keys in header order, e.g. ['bison', 'wolf', ...], from the pop_<key> columns of one CSV."""
    with open(path, newline='') as fh:
        header = next(csv.reader(fh), [])
    out = []
    for c in header:
        if c.startswith('pop_') and c[4:] not in out:
            out.append(c[4:])
    return out


def species_from_files(paths):
    """Union of species over several CSVs, in the order first seen."""
    out = []
    for p in paths:
        for k in species_from_header(p):
            if k not in out:
                out.append(k)
    return out
