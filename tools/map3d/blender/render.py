# Renders the city map's tiles (spec 2026-10-25 §3), from tools/map3d/out/: geometry.json (the generated city),
# render.json (map/city/render.json) and jobs.json (which tiles). Run by `npm run map-render`:
#   blender -b --factory-startup -P tools/map3d/blender/render.py -- tools/map3d/out
# Builds the scene once, then renders each tile with an orthographic camera over it, margin included, to
# out/png/<scale>/<col>_<row>.png, printing "TILE <id> <ms>" after each. A job with passes ['lit','dark','mask'] also
# renders out/png-dark (lights off: emission × its supply's level, grid point lights hidden, emergency ones shown) and out/png-mask (flat
# district indices, R = i×8, for the map's blackouts: spec 2026-10-27). Coordinates are map px; the ground is stretched
# north–south by 1/sin(elev) so a ground point renders at its own map % (shared/map-projection.ts).
# Lessons from the test, kept here: never lower lamps' specular (it darkens the scene in Eevee), keep surfaces at least
# 0.16 rough and pool lamps small, give pools a cut-off, keep fog off district borders, rain and grain stay live in the browser.
import bpy, bmesh, json, math, os, sys, time
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index('--') + 1]
G = json.load(open(os.path.join(OUT, 'geometry.json')))
R = json.load(open(os.path.join(OUT, 'render.json')))
JOBS = json.load(open(os.path.join(OUT, 'jobs.json')))
W, H = 4608.0, 3072.0
ELEV = math.radians(R['elevDeg'])
STRETCH = 1 / math.sin(ELEV)

def note(msg):
    print('NOTE ' + msg, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# The blackout mask's district indices: G['districts'][i] is index i+1; 0 (water, the gaps) never goes dark.
IDX = {d['id']: i + 1 for i, d in enumerate(G.get('districts') or [])}
def didx(item):
    return IDX.get(item.get('district') or '', 0)
# The mask's red channel holds 31 districts; an item naming a district not in the table would silently never go dark.
if len(IDX) > 31:
    raise SystemExit(f'more than 31 districts ({len(IDX)})')
for _list in ('buildings', 'props', 'strips', 'curves'):
    for _it in G.get(_list) or []:
        if (_it.get('district') or '') not in IDX and _it.get('district'):
            raise SystemExit(f"unknown district {_it['district']} in {_list}")
def owners_on_row(y, xs):
    """The district index under each x on the row at map y (scanline over the bordered districts, first one wins)."""
    out = [0] * len(xs)
    for d in G.get('districts') or []:
        b = d['border']
        if len(b) < 3:
            continue
        cuts = sorted(a[0] + (y - a[1]) * (c[0] - a[0]) / (c[1] - a[1]) for a, c in zip(b, b[1:] + b[:1]) if (a[1] > y) != (c[1] > y))
        for k in range(0, len(cuts) - 1, 2):
            for n, x in enumerate(xs):
                if not out[n] and cuts[k] <= x < cuts[k + 1]:
                    out[n] = IDX[d['id']]
    return out

def V(x, y, z=0.0):
    return Vector((x - W / 2, -(y - H / 2) * STRETCH, z))

def hexcol(h, a=1.0):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)

_mats = {}
def mat(name, base='#0b0910', rough=0.8, emit=None, strength=0.0, metal=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexcol(base)
    b.inputs['Roughness'].default_value = max(rough, R['wet']['roofRoughMin'])
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = hexcol(emit)
        b.inputs['Emission Strength'].default_value = strength
    _mats[name] = m
    return m

def obj_from_bm(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    for m in mats:
        me.materials.append(m)
    return ob

def corners(x, y, w, d, a):
    ca, sa = math.cos(a), math.sin(a)
    return [(x + sx * w / 2 * ca - sy * d / 2 * sa, y + sx * w / 2 * sa + sy * d / 2 * ca) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]

def box_into(bm, cs, z0, h):
    lo = [bm.verts.new(V(px, py, z0)) for px, py in cs]
    hi = [bm.verts.new(V(px, py, z0 + h)) for px, py in cs]
    fs = [bm.faces.new(hi[::-1]), bm.faces.new(lo)]
    for i in range(4):
        fs.append(bm.faces.new([lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]]))
    return fs

def prism_into(bm, p, q, w, t):
    ang = math.atan2(q[1] - p[1], q[0] - p[0])
    nx, ny = -math.sin(ang) * w / 2, math.cos(ang) * w / 2
    vs = [bm.verts.new(V(x + sx * nx, y + sx * ny, z + dz)) for (x, y, z) in [p, q] for sx in (-1, 1) for dz in (0, -t)]
    for f in [(0, 2, 6, 4), (1, 5, 7, 3), (0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6)]:
        bm.faces.new([vs[i] for i in f])

# ── the buildings' material: grime, brick by face, windows lit by share, wet roofs ──
def building_material():
    m = bpy.data.materials.new('buildings')
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bsdf = N['Principled BSDF']
    geo = N.new('ShaderNodeNewGeometry')
    pos = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], pos.inputs[0])
    nrm = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], nrm.inputs[0])
    def M(op, a=None, b=None, v1=None):
        n = N.new('ShaderNodeMath'); n.operation = op
        if a is not None: L.new(a, n.inputs[0])
        if b is not None: L.new(b, n.inputs[1])
        if v1 is not None: n.inputs[1].default_value = v1
        return n.outputs[0]
    wet = N.new('ShaderNodeMath'); wet.operation = 'MULTIPLY_ADD'
    L.new(nrm.outputs['Z'], wet.inputs[0]); wet.inputs[1].default_value = -0.4; wet.inputs[2].default_value = 0.72
    L.new(M('MAXIMUM', wet.outputs[0], v1=R['wet']['roofRoughMin']), bsdf.inputs['Roughness'])
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.12, 0.12, 0.02); L.new(geo.outputs['Position'], mp.inputs['Vector'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 6; L.new(mp.outputs[0], nz.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = hexcol('#100c14')
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = hexcol('#2e262c')
    st = N.new('ShaderNodeAttribute'); st.attribute_name = 'style'
    bc = N.new('ShaderNodeCombineXYZ'); L.new(M('ADD', pos.outputs['X'], pos.outputs['Y']), bc.inputs[0]); L.new(pos.outputs['Z'], bc.inputs[1])
    brick = N.new('ShaderNodeTexBrick'); L.new(bc.outputs[0], brick.inputs['Vector'])
    brick.inputs['Scale'].default_value = 1.6; brick.inputs['Mortar Size'].default_value = 0.03
    brick.inputs['Color1'].default_value = hexcol('#4a2620'); brick.inputs['Color2'].default_value = hexcol('#321a18'); brick.inputs['Mortar'].default_value = hexcol('#15100f')
    sock = lambda node, ident, out=False: next(x for x in (node.outputs if out else node.inputs) if x.identifier == ident)
    gm = N.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'; sock(gm, 'Factor_Float').default_value = 0.7
    L.new(brick.outputs['Color'], sock(gm, 'A_Color')); L.new(ramp.outputs['Color'], sock(gm, 'B_Color'))
    mixb = N.new('ShaderNodeMix'); mixb.data_type = 'RGBA'
    L.new(st.outputs['Fac'], sock(mixb, 'Factor_Float')); L.new(ramp.outputs['Color'], sock(mixb, 'A_Color')); L.new(sock(gm, 'Result_Color', True), sock(mixb, 'B_Color'))
    L.new(sock(mixb, 'Result_Color', True), bsdf.inputs['Base Color'])
    inf = N.new('ShaderNodeAttribute'); inf.attribute_name = 'info'
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(inf.outputs['Vector'], sep.inputs[0])
    tint = N.new('ShaderNodeAttribute'); tint.attribute_name = 'tint'
    hcell = M('DIVIDE', M('ADD', pos.outputs['X'], pos.outputs['Y']), v1=2.6)
    vcell = M('DIVIDE', pos.outputs['Z'], v1=3.2)
    win = M('MULTIPLY', M('LESS_THAN', M('FRACT', hcell), v1=0.38), M('LESS_THAN', M('FRACT', vcell), v1=0.42))
    comb = N.new('ShaderNodeCombineXYZ'); L.new(M('FLOOR', hcell), comb.inputs[0]); L.new(M('FLOOR', vcell), comb.inputs[1]); L.new(sep.outputs['Y'], comb.inputs[2])
    wn = N.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L.new(comb.outputs[0], wn.inputs['Vector'])
    on = M('MULTIPLY', M('MULTIPLY', win, M('LESS_THAN', wn.outputs['Value'], M('MULTIPLY', sep.outputs['X'], v1=0.5))), sep.outputs['Z'])
    dim = M('ADD', M('MULTIPLY', wn.outputs['Value'], v1=2.5), v1=0.6)
    L.new(tint.outputs['Color'], bsdf.inputs['Emission Color'])
    plain_emit = M('MULTIPLY', M('MULTIPLY', on, dim), v1=2.4)
    # Glass curtain walls (Nexus's towers): dark tinted glass with a sheen, close-set panes between thin mullions, a share
    # of them lit, and a faint glow in the tower's tint up the whole face. Kept dim so a tower's bloom stays inside a tile.
    gl = N.new('ShaderNodeAttribute'); gl.attribute_name = 'glass'
    g = gl.outputs['Fac']
    gh = M('DIVIDE', M('ADD', pos.outputs['X'], pos.outputs['Y']), v1=1.5)
    gv = M('DIVIDE', pos.outputs['Z'], v1=2.2)
    pane = M('MULTIPLY', M('LESS_THAN', M('FRACT', gh), v1=0.84), M('LESS_THAN', M('FRACT', gv), v1=0.74))
    gc = N.new('ShaderNodeCombineXYZ'); L.new(M('FLOOR', gh), gc.inputs[0]); L.new(M('FLOOR', gv), gc.inputs[1]); L.new(sep.outputs['Y'], gc.inputs[2])
    gn = N.new('ShaderNodeTexWhiteNoise'); gn.noise_dimensions = '3D'; L.new(gc.outputs[0], gn.inputs['Vector'])
    glit = M('MULTIPLY', M('MULTIPLY', pane, M('LESS_THAN', gn.outputs['Value'], M('MULTIPLY', sep.outputs['X'], v1=0.3))), sep.outputs['Z'])
    # Brighter toward the top of the face, as the painting's towers glow up into the haze.
    rise = M('MINIMUM', M('ADD', M('DIVIDE', pos.outputs['Z'], v1=260.0), v1=0.55), v1=1.3)
    glass_emit = M('ADD', M('MULTIPLY', M('MULTIPLY', glit, M('ADD', M('MULTIPLY', gn.outputs['Value'], v1=1.4), v1=0.6)), v1=1.5),
                   M('MULTIPLY', M('MULTIPLY', sep.outputs['Z'], rise), v1=0.07))
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L.new(g, inv.inputs[1])
    notg = inv.outputs[0]
    L.new(M('ADD', M('MULTIPLY', plain_emit, notg), M('MULTIPLY', glass_emit, g)), bsdf.inputs['Emission Strength'])
    # The glass itself: near-black blue, glossy, a little metallic, so the city's lights catch in it.
    gcol = N.new('ShaderNodeMix'); gcol.data_type = 'RGBA'
    L.new(g, sock(gcol, 'Factor_Float')); L.new(sock(mixb, 'Result_Color', True), sock(gcol, 'A_Color')); sock(gcol, 'B_Color').default_value = hexcol('#0a1224')
    # Raw concrete (the Shelf's brutalism): pale, mottled grey-buff with darker weather stains, matte,
    # so the floodlights and neon show the mass the dark wall material hides.
    co = N.new('ShaderNodeAttribute'); co.attribute_name = 'concrete'
    cmp2 = N.new('ShaderNodeMapping'); cmp2.inputs['Scale'].default_value = (0.25, 0.25, 0.06); L.new(geo.outputs['Position'], cmp2.inputs['Vector'])
    cnz2 = N.new('ShaderNodeTexNoise'); cnz2.inputs['Scale'].default_value = 1.0; cnz2.inputs['Detail'].default_value = 8; L.new(cmp2.outputs[0], cnz2.inputs['Vector'])
    cramp = N.new('ShaderNodeValToRGB'); L.new(cnz2.outputs['Fac'], cramp.inputs['Fac'])
    cramp.color_ramp.elements[0].position = 0.3; cramp.color_ramp.elements[0].color = hexcol('#4c4a46')
    cramp.color_ramp.elements[1].position = 0.75; cramp.color_ramp.elements[1].color = hexcol('#8a857c')
    ccol = N.new('ShaderNodeMix'); ccol.data_type = 'RGBA'
    L.new(co.outputs['Fac'], sock(ccol, 'Factor_Float')); L.new(sock(gcol, 'Result_Color', True), sock(ccol, 'A_Color')); L.new(cramp.outputs['Color'], sock(ccol, 'B_Color'))
    L.new(sock(ccol, 'Result_Color', True), bsdf.inputs['Base Color'])
    rough_in = bsdf.inputs['Roughness'].links[0].from_socket
    L.new(M('MAXIMUM', M('ADD', M('MULTIPLY', rough_in, notg), M('MULTIPLY', g, v1=0.14)), M('MULTIPLY', co.outputs['Fac'], v1=0.92)), bsdf.inputs['Roughness'])
    L.new(M('MULTIPLY', g, v1=0.6), bsdf.inputs['Metallic'])
    return m

BMAT = building_material()
metal = mat('metal', '#2a2230', 0.45, metal=0.7)
concrete = mat('concrete', '#221c26', 0.9)
dark = mat('dark', '#0e0b12', 0.85)

def wet_ground():
    m = mat('ground', '#07060a', 0.35)
    gn = m.node_tree
    tx = gn.nodes.new('ShaderNodeTexNoise'); tx.inputs['Scale'].default_value = 0.04; tx.inputs['Detail'].default_value = 3
    rr = gn.nodes.new('ShaderNodeValToRGB'); gn.links.new(tx.outputs['Fac'], rr.inputs['Fac'])
    lo, hi = R['wet']['puddleRough']
    rr.color_ramp.elements[0].position = 0.45; rr.color_ramp.elements[0].color = (lo, lo, lo, 1)
    rr.color_ramp.elements[1].position = 0.6; rr.color_ramp.elements[1].color = (hi, hi, hi, 1)
    gn.links.new(rr.outputs['Color'], gn.nodes['Principled BSDF'].inputs['Roughness'])
    return m
ground = wet_ground()

# Drownworks' settling water: teal lit from below, a slow ripple in the glow so a bay reads as water, not a panel.
def bay_material(name, base, emit, strength):
    # Rough enough that lamps over it blur instead of showing as a hot dot.
    m = mat(name, base, 0.55, emit, strength)
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = N['Principled BSDF']
    geo = N.new('ShaderNodeNewGeometry')
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.22, 0.22, 0.22); L.new(geo.outputs['Position'], mp.inputs['Vector'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Detail'].default_value = 3; L.new(mp.outputs[0], nz.inputs['Vector'])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY_ADD'
    L.new(nz.outputs['Fac'], k.inputs[0]); k.inputs[1].default_value = strength * 1.1; k.inputs[2].default_value = strength * 0.35
    L.new(k.outputs[0], b.inputs['Emission Strength'])
    return m
# Half the old glow, shaded rim to core: a dark band at the edge, a dim middle, the brightest water in the centre.
BAY = bay_material('bay', '#03201f', '#2ad6c8', 0.26)
BAY_DIM = bay_material('bay-dim', '#021514', '#1a9a90', 0.11)
BAY_MID = bay_material('bay-mid', '#021817', '#22b8ac', 0.13)
BAY_EDGE = bay_material('bay-edge', '#010d0c', '#127a72', 0.05)
# Between the bands, so rim to core fades in five soft steps rather than three hard ones.
BAY_OUT = bay_material('bay-out', '#011312', '#1a9a90', 0.085)
BAY_IN = bay_material('bay-in', '#021c1b', '#26c8bb', 0.19)

# ── the bay: water under everything; each district's border is land on it ──
pad = 600
def water_material():
    m = bpy.data.materials.new('water')
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    b.inputs['Base Color'].default_value = hexcol('#0d1a33')
    # Rough enough that screen-space reflections stay off (they break at tile edges): lamps still glint on it.
    b.inputs['Roughness'].default_value = 0.14
    b.inputs['Specular IOR Level'].default_value = 0.8
    geo = N.new('ShaderNodeNewGeometry')
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.35, 0.12, 0.35); L.new(geo.outputs['Position'], mp.inputs['Vector'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Detail'].default_value = 4; L.new(mp.outputs[0], nz.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; L.new(nz.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    # The night bay holds the city's sky glow: a faint, rippled navy so the coast reads against black land.
    b.inputs['Emission Color'].default_value = hexcol('#123060')
    rip = N.new('ShaderNodeMath'); rip.operation = 'MULTIPLY_ADD'
    L.new(nz.outputs['Fac'], rip.inputs[0]); rip.inputs[1].default_value = 0.4; rip.inputs[2].default_value = 0.08
    L.new(rip.outputs[0], b.inputs['Emission Strength'])
    return m
MASK_HIDDEN = []
bm = bmesh.new()
for x, y in [(-pad, -pad), (W + pad, -pad), (W + pad, H + pad), (-pad, H + pad)]:
    bm.verts.new(V(x, y, -0.6))
bm.faces.new(bm.verts)
WATER = obj_from_bm('water', bm, [water_material()])
MASK_HIDDEN.append(WATER)
# The mask pass's floor under the water and the gaps: within a lamp's reach they belong to the nearest district, so its
# pools on the bay go dark with it (mask-floor.ts). Hidden in the lit and dark passes.
MASK_FLOOR = None
mf = G.get('maskFloor')
if mf:
    bm = bmesh.new(); mfl = bm.faces.layers.int.new('district'); st = mf['step']
    for row, c0, c1, di in mf['runs']:
        x0, x1, y0, y1 = c0 * st, (c1 + 1) * st, row * st, (row + 1) * st
        f = bm.faces.new([bm.verts.new(V(x, y, -0.6)) for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]])
        if f.normal.z < 0: f.normal_flip()
        f[mfl] = di
    MASK_FLOOR = obj_from_bm('mask-floor', bm, [ground]); MASK_FLOOR.hide_render = True
land = G.get('land') or []
if not land:
    bm = bmesh.new()
    for x, y in [(-pad, -pad), (W + pad, -pad), (W + pad, H + pad), (-pad, H + pad)]:
        bm.verts.new(V(x, y, -0.3))
    bm.faces.new(bm.verts)
    obj_from_bm('ground', bm, [ground])
fill = G.get('landFill')
if fill:
    bm = bmesh.new(); st = fill['step']
    for row, c0, c1 in fill['runs']:
        x0, x1, y0, y1 = c0 * st, (c1 + 1) * st, row * st, (row + 1) * st
        bm.faces.new([bm.verts.new(V(x, y, -0.25)) for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]])
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
    MASK_HIDDEN.append(obj_from_bm('land-fill', bm, [ground]))
for k, poly in enumerate(land):
    bm = bmesh.new()
    try:
        f = bm.faces.new([bm.verts.new(V(x, y, -0.2)) for x, y in poly])
        bmesh.ops.triangulate(bm, faces=[f])
        # A low quay edge so the shore reads against the water.
        r = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        bmesh.ops.translate(bm, vec=(0, 0, -0.5), verts=[e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = obj_from_bm(f'land-{k}', bm, [ground])
        ob['district'] = IDX.get((G.get('landDistricts') or [])[k] if k < len(G.get('landDistricts') or []) else '', 0)
    except Exception as e:
        note(f'land {k}: {e}')

T = G.get('terrain')
GRIDS = ([T] if T else []) + (G.get('islands') or [])
if GRIDS:
    cliff = bpy.data.materials.new('cliff'); cn = cliff.node_tree.nodes; cL = cliff.node_tree.links
    cb = cn['Principled BSDF']; cb.inputs['Roughness'].default_value = 0.95
    cg = cn.new('ShaderNodeNewGeometry'); cmp = cn.new('ShaderNodeMapping'); cmp.inputs['Scale'].default_value = (0.03, 0.03, 0.3); cL.new(cg.outputs['Position'], cmp.inputs['Vector'])
    cnz = cn.new('ShaderNodeTexNoise'); cnz.inputs['Detail'].default_value = 10; cL.new(cmp.outputs[0], cnz.inputs['Vector'])
    cr = cn.new('ShaderNodeValToRGB'); cL.new(cnz.outputs['Fac'], cr.inputs['Fac'])
    cr.color_ramp.elements[0].color = hexcol('#09080b'); cr.color_ramp.elements[1].color = hexcol('#4a4448'); cr.color_ramp.elements[0].position = 0.4; cr.color_ramp.elements[1].position = 0.72
    cL.new(cr.outputs['Color'], cb.inputs['Base Color'])
    cbump = cn.new('ShaderNodeBump'); cbump.inputs['Strength'].default_value = 1.4; cL.new(cnz.outputs['Fac'], cbump.inputs['Height']); cL.new(cbump.outputs['Normal'], cb.inputs['Normal'])
    # The isles' rock: the same stone, its steep faces faintly lit by the night (a cool sheen by slope), so cliffs read
    # against the bay without lamps; flat tops stay dark.
    isle_rock = cliff.copy(); isle_rock.name = 'isle-cliff'
    inn = isle_rock.node_tree.nodes; inl = isle_rock.node_tree.links; ib = inn['Principled BSDF']
    ig = inn.new('ShaderNodeNewGeometry'); isep = inn.new('ShaderNodeSeparateXYZ'); inl.new(ig.outputs['Normal'], isep.inputs[0])
    islope = inn.new('ShaderNodeMath'); islope.operation = 'SUBTRACT'; islope.inputs[0].default_value = 1.0; inl.new(isep.outputs['Z'], islope.inputs[1])
    ipow = inn.new('ShaderNodeMath'); ipow.operation = 'POWER'; inl.new(islope.outputs[0], ipow.inputs[0]); ipow.inputs[1].default_value = 2.0
    istr = inn.new('ShaderNodeMath'); istr.operation = 'MULTIPLY_ADD'; inl.new(ipow.outputs[0], istr.inputs[0]); istr.inputs[1].default_value = 0.45; istr.inputs[2].default_value = 0.07
    ib.inputs['Emission Color'].default_value = hexcol('#5a6478'); inl.new(istr.outputs[0], ib.inputs['Emission Strength'])
    # Lighter, moonlit grey-olive rock and scrub, so the slopes read (the city's cliff stays dark).
    for el in inn:
        if el.type == 'VALTORGB':
            el.color_ramp.elements[0].color = hexcol('#161a18'); el.color_ramp.elements[1].color = hexcol('#5c6052')
    # A wooded hill's floor (Cloudridge): dark leaf litter under the trees, no moonlit sheen, so the lamps and windows
    # carry it.
    hill_floor = mat('hill-floor', '#0b0d0b', 0.95)
    for gi, T in enumerate(GRIDS):
        cols, rows, step, hs = T['cols'], T['rows'], T['step'], T['heights']
        bm = bmesh.new(); verts = {}; tdl = bm.faces.layers.int.new('district')
        own = IDX.get(T.get('id', ''), 0)
        def vert(i, j):
            k = j * cols + i
            if k not in verts:
                verts[k] = bm.verts.new(V(T['x0'] + i * step, T['y0'] + j * step, max(0.0, hs[k])))
            return verts[k]
        for j in range(rows - 1):
            row = [own] * (cols - 1) if own else owners_on_row(T['y0'] + (j + 0.5) * step, [T['x0'] + (i + 0.5) * step for i in range(cols - 1)])
            for i in range(cols - 1):
                q = [hs[j * cols + i], hs[j * cols + i + 1], hs[(j + 1) * cols + i + 1], hs[(j + 1) * cols + i]]
                if all(h < 0 for h in q):
                    continue
                bm.faces.new([vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)])[tdl] = row[i]
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        obj_from_bm(f'climb-{gi}', bm, [hill_floor if T.get('forest') else isle_rock if 'id' in T else cliff])

# ── buildings: one mesh, per-face tint, lit share, seed, wall flag, brick ──
bm = bmesh.new()
tint_l = bm.faces.layers.float_color.new('tint')
info_l = bm.faces.layers.float_vector.new('info')
style_l = bm.faces.layers.float.new('style')
glass_l = bm.faces.layers.float.new('glass')
concrete_l = bm.faces.layers.float.new('concrete')
district_l = bm.faces.layers.int.new('district')
# On a generator (blackouts phase 2): its windows keep this share of their light when the grid is down.
backup_l = bm.faces.layers.float.new('backup')
for b in G['buildings']:
    col = hexcol(b['tint']); di = didx(b)
    for k, f in enumerate(box_into(bm, corners(b['x'], b['y'], b['w'], b['d'], b['a']), b['z0'], b['h'])):
        f[district_l] = di
        f[tint_l] = col
        f[info_l] = (b['lit'], b['seed'], 0 if k < 2 else 1)
        f[style_l] = float(b['brick'])
        f[glass_l] = float(b.get('glass', 0))
        f[concrete_l] = float(b.get('concrete', 0))
        f[backup_l] = float(b.get('backup', 0))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
obj_from_bm('buildings', bm, [BMAT])

# ── props: plain kinds share a material, glowing kinds one per colour ──
PLAIN = {'tank': metal, 'ac': metal, 'mast': metal, 'fan': metal, 'lattice': metal, 'board-frame': metal, 'pylon': concrete,
         'rubble': mat('rubble', '#2a1e1e', 0.95), 'scree': mat('scree', '#1c171f', 0.95), 'pine': mat('pine', '#0a100c', 0.9), 'crag': mat('crag', '#3a3846', 0.9)}
GLOW = {'barrel': 6, 'sign': 12, 'shopfront': 10, 'hanging-sign': 14, 'billboard': 9, 'lamp': 14, 'ring': 2.5}
groups = {}
EMERGENCY_OBJECTS = []
for p in G['props']:
    k = p['kind']
    key = ((k, p.get('color')) if (k in GLOW or k in ('laundry', 'container')) else (k, None)) + (didx(p), p.get('supply') or '')
    groups.setdefault(key, []).append(p)
for (kind, color, di, supply), items in groups.items():
    bm = bmesh.new()
    for p in items:
        if kind in ('tank', 'pine', 'fan', 'clarifier', 'clarifier-mid', 'clarifier-edge', 'crag'):
            r1 = p['w'] / 2
            r2 = 0 if kind == 'pine' else r1 * 0.22 if kind == 'crag' else r1
            bmesh.ops.create_cone(bm, cap_ends=True, segments=6 if kind == 'pine' else 7 if kind == 'crag' else 32 if kind.startswith('clarifier') or p['w'] > 8 else 10, radius1=r1, radius2=r2, depth=p['h'],
                                  matrix=Matrix.Translation(V(p['x'], p['y'], p['z0'] + p['h'] / 2)))
        else:
            box_into(bm, corners(p['x'], p['y'], p['w'], p['d'], p['a']), p['z0'], p['h'])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if kind in GLOW:
        m = mat(f'{kind}{color}', '#120b14', 0.6, color or '#ffb347', GLOW[kind])
    elif kind == 'laundry':
        m = mat(f'laundry{color}', color or '#7a5a5a', 0.9)
    elif kind == 'container':
        # Dockside's containers: painted steel in the stack's colour, a faint glow of it so the yard's patchwork reads
        # in the dark between floodlights.
        m = mat(f'container{color}', color or '#6a6e78', 0.6, color or '#6a6e78', 0.08, metal=0.3)
    elif kind in ('clarifier', 'clarifier-mid', 'clarifier-edge'):
        m = {'clarifier': BAY, 'clarifier-mid': BAY_MID, 'clarifier-edge': BAY_EDGE}[kind]
    else:
        m = PLAIN.get(kind, concrete)
    ob = obj_from_bm(f'props-{kind}-{color}-{di}-{supply}', bm, [m]); ob['district'] = di
    # Who powers it (blackouts phase 2): absent is the grid; 'own' burns either way; 'emergency' only in the dark.
    if supply:
        ob[supply] = 1.0
    # Fires lit in the dark and roof lights aren't there at all in the lit city (nor in the mask).
    if supply == 'emergency':
        ob.hide_render = True
        EMERGENCY_OBJECTS.append(ob)

# ── strips: walkways, rails, undersides, girders, slabs, pipes, floors, stairs, roads, light trails ──
SMAT = {'walkway': mat('walkway', '#2e2430', 0.5, metal=0.3), 'rail': metal, 'soffit': mat('soffit', '#060408', 0.9),
        'girder': mat('walkway', '#2e2430', 0.5, metal=0.3), 'slab': dark, 'pipe': metal, 'floor': mat('canyon-floor', '#050407', 0.9),
        'stair': metal, 'road': mat('road', '#16141c', 0.3, metal=0.2), 'trail-red': mat('trail-r', '#000000', 1, '#ff3b5c', 5),
        'trail-white': mat('trail-w', '#000000', 1, '#fff1d6', 4),
        # The Spine's traffic: short faint runs of car lights (the live layer draws the moving cars).
        'car-red': mat('car-r', '#000000', 1, '#ff3b5c', 1.6), 'car-white': mat('car-w', '#000000', 1, '#fff1d6', 1.4),
        'concrete': mat('pier', '#2c2630', 0.9),
        # The Strand's grid streets: wet asphalt, a shade darker than the highways.
        'street': mat('street', '#110f16', 0.3, metal=0.2),
        # Drownworks' settling bays: the water glows teal from below. Dim enough that its bloom stays inside a tile.
        'bay': BAY,
        # A bay settling dark (being drained or between batches): a fainter glow.
        'bay-dim': BAY_DIM, 'bay-mid': BAY_MID, 'bay-edge': BAY_EDGE, 'bay-out': BAY_OUT, 'bay-in': BAY_IN,
        # Sludge drying beds: dark, wet, brown-black; wet sheen but rough enough for the tile rule.
        'sludge': mat('sludge', '#120c08', 0.3),
        # Dockside's gantry cranes: red-painted steel, a faint red glow so they read against the night as painted.
        'crane': mat('crane', '#7a1c14', 0.5, '#ff3a1e', 0.35, metal=0.4)}
sgroups = {}
for s in G['strips']:
    key = (s['material'], s.get('color') if s['material'] == 'street-light' else None, didx(s))
    sgroups.setdefault(key, []).append(s)
for (material, color, di), items in sgroups.items():
    bm = bmesh.new()
    for s in items:
        if s.get('ends'):
            prism_into(bm, s['ends'][0], s['ends'][1], s['d'], s['h'])
        else:
            box_into(bm, corners(s['x'], s['y'], s['w'], s['d'], s['a']), s['z0'], s['h'])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = mat(f'street{color}', '#000000', 1, color, 5) if material == 'street-light' else SMAT.get(material, metal)
    obj_from_bm(f'strips-{material}-{color}-{di}', bm, [m])['district'] = di

# ── curves: cables and neon ──
cgroups = {}
for c in G['curves']:
    cgroups.setdefault((c['material'], c.get('color'), c['bevel'], c.get('strength', 38), didx(c)), []).append(c)
for (material, color, bevel, strength, di), items in cgroups.items():
    cu = bpy.data.curves.new(f'{material}{color}', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = bevel
    for c in items:
        sp = cu.splines.new('POLY'); sp.points.add(len(c['points']) - 1)
        for k, (x, y, z) in enumerate(c['points']):
            sp.points[k].co = (*V(x, y, z), 1)
    ob = bpy.data.objects.new(f'curves-{material}-{color}-{di}', cu); sc.collection.objects.link(ob); ob['district'] = di
    cu.materials.append(mat('cable', '#0a080c', 0.6) if material == 'cable' else mat(f'neon{color}{strength}', '#000000', 1, color, strength))

# ── volumes: the darkness over the Ribbon's low levels ──
VOLUMES = []
for v in G['volumes']:
    bm = bmesh.new()
    lo = [bm.verts.new(V(x, y, v['z0'])) for x, y in v['outline']]
    hi = [bm.verts.new(V(x, y, v['z1'])) for x, y in v['outline']]
    bm.faces.new(lo[::-1]); bm.faces.new(hi)
    n = len(lo)
    for i in range(n):
        bm.faces.new([lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mist = v['kind'] == 'mist'
    dm = bpy.data.materials.new(v['kind']); dn = dm.node_tree.nodes; dn.remove(dn['Principled BSDF'])
    # The ridge's mist scatters pale blue-grey; the Ribbon's darkness absorbs.
    dvol = dn.new('ShaderNodeVolumePrincipled'); dvol.inputs['Density'].default_value = v['density']; dvol.inputs['Color'].default_value = hexcol('#9aa2c4' if mist else '#2a1a30')
    dvol.inputs['Absorption Color'].default_value = hexcol('#20242e' if mist else '#100810')
    dm.node_tree.links.new(dvol.outputs[0], dn['Material Output'].inputs['Volume'])
    VOLUMES.append(obj_from_bm(v['kind'], bm, [dm]))

# ── light: point lights with cut-offs, sky, moon and rim, low fog ──
POINTS = []  # on the grid: off in the dark pass
OWN_POINTS = []  # fires and candles: on in every pass
EMERGENCY_POINTS = []  # only when the grid is down
for l in G['lights']:
    ld = bpy.data.lights.new('p', 'POINT')
    ld.use_shadow = False
    ld.energy = l['power']; ld.color = hexcol(l['color'])[:3]; ld.shadow_soft_size = l['radius']
    try:
        ld.use_custom_distance = True; ld.cutoff_distance = l['reach']
    except Exception as e:
        note(f'light cut-off: {e}')
    o = bpy.data.objects.new('p', ld); o.location = V(l['x'], l['y'], l['z']); sc.collection.objects.link(o)
    supply = l.get('supply')
    if supply == 'emergency':
        o.hide_render = True
        EMERGENCY_POINTS.append(o)
    else:
        (OWN_POINTS if supply == 'own' else POINTS).append(o)
world = bpy.data.worlds.new('night'); sc.world = world
wn = world.node_tree.nodes
wn['Background'].inputs['Color'].default_value = hexcol(R['sky']['color']); wn['Background'].inputs['Strength'].default_value = R['sky']['strength']
for name, key in (('moon', 'moon'), ('rim', 'rim')):
    sd = bpy.data.lights.new(name, 'SUN'); sd.energy = R[key]['energy']; sd.color = (0.6, 0.65, 1.0)
    so = bpy.data.objects.new(name, sd); so.rotation_euler = tuple(math.radians(a) for a in R[key]['rotation']); sc.collection.objects.link(so)
    if key == 'rim':
        sd.use_shadow = False
fh = R['fog']['height']
bpy.ops.mesh.primitive_cube_add(location=V(W / 2, H / 2, fh / 2)); fog = bpy.context.object
fog.scale = ((W + 2 * pad) / 2, (H + 2 * pad) * STRETCH / 2, fh / 2)
fm = bpy.data.materials.new('fog'); fn = fm.node_tree.nodes; fn.remove(fn['Principled BSDF'])
fv = fn.new('ShaderNodeVolumePrincipled'); fv.inputs['Density'].default_value = R['fog']['density']; fv.inputs['Color'].default_value = hexcol(R['fog']['color'])
fm.node_tree.links.new(fv.outputs[0], fn['Material Output'].inputs['Volume']); fog.data.materials.append(fm); VOLUMES.append(fog)

# ── camera, engine, grade (bloom, colour balance, contrast; the rest stays live in the browser) ──
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.clip_start = 500; cam.clip_end = 6000
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
co.rotation_euler = (math.radians(90) - ELEV, 0, 0)
sc.render.engine = 'BLENDER_EEVEE'
for attr, val in [('taa_render_samples', R['samples']), ('use_volumetric_shadows', False), ('volumetric_tile_size', '2'), ('use_shadows', True), ('use_raytracing', True), ('volumetric_start', 500.0), ('volumetric_end', 6000.0)]:
    try:
        setattr(sc.eevee, attr, val)
    except Exception as e:
        note(f'eevee {attr}: {e}')
# Screen-space reflections stop at a tile's edge (a reflection sits far below its source at the deeper levels), so the
# wet surfaces (rougher than 0.16) reflect lamps and sky, not the screen: tiles meet without a break.
try:
    sc.eevee.ray_tracing_options.trace_max_roughness = 0.1
except Exception as e:
    note(f'ray tracing roughness: {e}')
sc.view_settings.view_transform = 'AgX'
try:
    sc.view_settings.look = R['grade']['look']
except Exception as e:
    note(f'look: {e}')
sc.view_settings.exposure = R['grade']['exposure']
ng = bpy.data.node_groups.new('comp', 'CompositorNodeTree'); NN = ng.nodes; LL = ng.links
rl = NN.new('CompositorNodeRLayers'); gl = NN.new('CompositorNodeGlare')
outn = NN.new('NodeGroupOutput'); ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
B = R['grade']['bloom']
for name, val in [('Type', 'Bloom'), ('Quality', 'High'), ('Threshold', B['threshold']), ('Size', B['size']), ('Strength', B['strength']), ('Smoothness', 0.4)]:
    try:
        gl.inputs[name].default_value = val
    except Exception as e:
        note(f'glare {name}: {e}')
LL.new(rl.outputs['Image'], gl.inputs['Image']); cur = gl.outputs['Image']
cbn = NN.new('CompositorNodeColorBalance')
try:
    for x in cbn.inputs:
        if x.name == 'Lift' and x.type == 'RGBA': x.default_value = (*R['grade']['lift'], 1)
        if x.name == 'Gain' and x.type == 'RGBA': x.default_value = (*R['grade']['gain'], 1)
    LL.new(cur, cbn.inputs['Image']); cur = cbn.outputs['Image']
except Exception as e:
    note(f'colour balance: {e}')
bcn = NN.new('CompositorNodeBrightContrast'); bcn.inputs['Contrast'].default_value = R['grade']['contrast']
LL.new(cur, bcn.inputs['Image']); LL.new(bcn.outputs[0], outn.inputs[0])
sc.compositing_node_group = ng; sc.render.use_compositing = True
sc.render.image_settings.file_format = 'PNG'

# ── blackouts: every emission × its supply's level (phase 2). With `power` the view layer's (1 lit, 0 dark), the
# object's `own` / `emergency` flags and a building face's `backup` share:
#   level = max(power + own·(1 − power) + emergency·(1 − 2·power), backup)
# so the grid follows power, own stays 1, emergency is 1 − power, and a generator building never drops below its
# backup. The water's glow and the isles' moonlit sheen stand in for moonlight, so they stay. ──
MOONLIT = {'water', 'isle-cliff'}
vl = bpy.context.view_layer
vl['power'] = 1.0
SUPPLY = bpy.data.node_groups.new('supply-level', 'ShaderNodeTree')
SUPPLY.interface.new_socket('Level', in_out='OUTPUT', socket_type='NodeSocketFloat')
_n = SUPPLY.nodes; _l = SUPPLY.links
_out = _n.new('NodeGroupOutput')
def _attr(kind, name):
    a = _n.new('ShaderNodeAttribute'); a.attribute_type = kind; a.attribute_name = name
    return a.outputs['Fac']
def _math(op, a, b):
    m = _n.new('ShaderNodeMath'); m.operation = op
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            _l.new(v, m.inputs[i])
    return m.outputs[0]
_pw = _attr('VIEW_LAYER', 'power')
_own = _math('MULTIPLY', _attr('OBJECT', 'own'), _math('SUBTRACT', 1.0, _pw))
_em = _math('MULTIPLY', _attr('OBJECT', 'emergency'), _math('SUBTRACT', 1.0, _math('MULTIPLY', _pw, 2.0)))
_base = _math('ADD', _math('ADD', _pw, _own), _em)
_l.new(_math('MAXIMUM', _base, _attr('GEOMETRY', 'backup')), _out.inputs['Level'])
for m in bpy.data.materials:
    if not m.node_tree or m.name in MOONLIT:
        continue
    nt = m.node_tree
    for b in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
        es = b.inputs['Emission Strength']
        level = nt.nodes.new('ShaderNodeGroup'); level.node_tree = SUPPLY
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        if es.is_linked:
            src = es.links[0].from_socket
            nt.links.remove(es.links[0])
            nt.links.new(src, mul.inputs[0])
        else:
            mul.inputs[0].default_value = es.default_value
        nt.links.new(level.outputs['Level'], mul.inputs[1])
        nt.links.new(mul.outputs[0], es)
# The mask: flat emission of max(face 'district', object 'district') × 8/255 on red, nothing else.
mask_mat = bpy.data.materials.new('district-mask'); mn = mask_mat.node_tree.nodes; ml = mask_mat.node_tree.links
mn.remove(mn['Principled BSDF'])
ag = mn.new('ShaderNodeAttribute'); ag.attribute_type = 'GEOMETRY'; ag.attribute_name = 'district'
ao = mn.new('ShaderNodeAttribute'); ao.attribute_type = 'OBJECT'; ao.attribute_name = 'district'
mx = mn.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; ml.new(ag.outputs['Fac'], mx.inputs[0]); ml.new(ao.outputs['Fac'], mx.inputs[1])
sc8 = mn.new('ShaderNodeMath'); sc8.operation = 'MULTIPLY'; sc8.inputs[1].default_value = 8 / 255; ml.new(mx.outputs[0], sc8.inputs[0])
cc = mn.new('ShaderNodeCombineColor'); ml.new(sc8.outputs[0], cc.inputs['Red'])
em = mn.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0; ml.new(cc.outputs[0], em.inputs['Color'])
ml.new(em.outputs[0], mn['Material Output'].inputs['Surface'])

def render_to(folder, scale, key):
    path = os.path.join(OUT, folder, scale, key + '.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def dark_pass(scale, key):
    vl['power'] = 0.0
    for o in POINTS: o.hide_render = True
    for o in EMERGENCY_POINTS + EMERGENCY_OBJECTS: o.hide_render = False
    try:
        render_to('png-dark', scale, key)
    finally:
        vl['power'] = 1.0
        for o in POINTS: o.hide_render = False
        for o in EMERGENCY_POINTS + EMERGENCY_OBJECTS: o.hide_render = True

def mask_pass(scale, key):
    saved = (sc.render.use_compositing, sc.view_settings.view_transform, sc.view_settings.look, sc.view_settings.exposure,
             sc.eevee.taa_render_samples, sc.render.filter_size, sc.render.dither_intensity, wn['Background'].inputs['Strength'].default_value,
             sc.render.image_settings.color_mode)
    vl.material_override = mask_mat
    for o in VOLUMES + MASK_HIDDEN: o.hide_render = True
    if MASK_FLOOR: MASK_FLOOR.hide_render = False
    sc.render.use_compositing = False
    sc.view_settings.view_transform = 'Raw'
    sc.view_settings.exposure = 0.0
    sc.eevee.taa_render_samples = 1
    sc.render.filter_size = 0.0
    sc.render.dither_intensity = 0.0
    wn['Background'].inputs['Strength'].default_value = 0.0
    sc.render.image_settings.color_mode = 'RGB'
    try:
        render_to('png-mask', scale, key)
    finally:
        vl.material_override = None
        for o in VOLUMES + MASK_HIDDEN: o.hide_render = False
        if MASK_FLOOR: MASK_FLOOR.hide_render = True
        (sc.render.use_compositing, sc.view_settings.view_transform, look, sc.view_settings.exposure, sc.eevee.taa_render_samples,
         sc.render.filter_size, sc.render.dither_intensity, wn['Background'].inputs['Strength'].default_value, sc.render.image_settings.color_mode) = saved
        try:
            sc.view_settings.look = look
        except Exception as e:
            note(f'look: {e}')

# ── the tiles ──
back = Vector((0, -math.cos(ELEV), math.sin(ELEV))) * 3000
for j in JOBS:
    t0 = time.time()
    co.location = V(j['cx'], j['cy'], 0) + back
    cam.ortho_scale = j['size']
    sc.render.resolution_x = sc.render.resolution_y = j['px']
    sc.render.resolution_percentage = 100
    scale, key = j['id'].split('/')
    passes = j.get('passes', ['lit'])
    render_to('png', scale, key)
    if 'dark' in passes:
        dark_pass(scale, key)
    if 'mask' in passes:
        mask_pass(scale, key)
    print(f"TILE {j['id']} {int((time.time() - t0) * 1000)}", flush=True)
