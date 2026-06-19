const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const SECRET = process.env.JWT_SECRET || 'secret';
const A_USER = process.env.ADMIN_USER || 'admin';
const A_PASS = process.env.ADMIN_PASS || 'admin123';

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
};

const json = (res, data, code = 200) => { cors(res); res.status(code).json(data); };

const getUser = (req) => {
  try {
    const d = jwt.verify(req.headers.authorization?.split(' ')[1], SECRET);
    return d.role === 'member' ? d : null;
  } catch { return null; }
};

const getAdmin = (req) => {
  try {
    const d = jwt.verify(req.headers.authorization?.split(' ')[1], SECRET);
    return d.role === 'admin' ? d : null;
  } catch { return null; }
};

const rollItem = (items) => {
  let r = Math.random() * 100, c = 0;
  for (const it of items) { c += it.drop_rate; if (r <= c) return it; }
  return items[items.length - 1];
};

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const path = req.url.replace('/api', '').replace(/\?.*$/, '');
  const body = req.body || {};
  
  try {
    // LOGIN
    if (path === '/login' && req.method === 'POST') {
      const { username, password, role } = body;
      if (!username || !password) return json(res, { error: 'Isi semua' }, 400);
      if (role === 'admin') {
        if (username === A_USER && password === A_PASS)
          return json(res, { token: jwt.sign({ role: 'admin', username }, SECRET, { expiresIn: '7d' }), role: 'admin', username });
        return json(res, { error: 'Admin salah' }, 401);
      }
      const { data: u } = await db.from('users').select('*').ilike('growid', username).maybeSingle();
      if (!u) return json(res, { error: 'User tidak ada' }, 401);
      if (!(await bcrypt.compare(password, u.password))) return json(res, { error: 'Password salah' }, 401);
      return json(res, { token: jwt.sign({ role: 'member', userId: u.id, username: u.growid }, SECRET, { expiresIn: '7d' }), role: 'member', username: u.growid });
    }
    
    // REGISTER
    if (path === '/register' && req.method === 'POST') {
      const { username, password } = body;
      if (!username || !password) return json(res, { error: 'Isi semua' }, 400);
      if (password.length < 4) return json(res, { error: 'Password min 4' }, 400);
      if (username.toLowerCase() === A_USER.toLowerCase()) return json(res, { error: 'Username tidak boleh' }, 400);
      const { data: ex } = await db.from('users').select('id').ilike('growid', username).maybeSingle();
      if (ex) return json(res, { error: 'Sudah terdaftar' }, 400);
      const hash = await bcrypt.hash(password, 10);
      await db.from('users').insert({ growid: username, password: hash });
      return json(res, { success: true });
    }
    
    // ME
    if (path === '/me') {
      const u = getUser(req);
      if (!u) return json(res, { error: 'Unauthorized' }, 401);
      const { data } = await db.from('users').select('id, growid, gems, wl, created_at').eq('id', u.userId).single();
      if (!data) return json(res, { error: 'Not found' }, 404);
      return json(res, data);
    }
    
    // BANNERS (public)
    if (path === '/banners') {
      const { data } = await db.from('banners').select('*').order('id');
      return json(res, data || []);
    }
    
    // SPIN
    if (path === '/spin' && req.method === 'POST') {
      const u = getUser(req);
      if (!u) return json(res, { error: 'Unauthorized' }, 401);
      const { bannerId, count = 1 } = body;
      const { data: b } = await db.from('banners').select('*').eq('id', bannerId).single();
      if (!b) return json(res, { error: 'Banner tidak ada' }, 404);
      const { data: usr } = await db.from('users').select('*').eq('id', u.userId).single();
      const cost = b.price_gems * count;
      if (usr.gems < cost) return json(res, { error: 'Gems kurang' }, 400);
      const { data: items } = await db.from('items').select('*');
      if (!items?.length) return json(res, { error: 'No items' }, 400);
      await db.from('users').update({ gems: usr.gems - cost }).eq('id', u.userId);
      const results = [];
      for (let i = 0; i < count; i++) {
        const r = rollItem(items);
        await db.from('inventory').insert({ user_id: u.userId, item_name: r.name, item_icon: r.icon, item_rarity: r.rarity });
        results.push({ name: r.name, icon: r.icon, rarity: r.rarity });
      }
      const { data: up } = await db.from('users').select('gems, wl').eq('id', u.userId).single();
      return json(res, { results, balance: up });
    }
    
    // INVENTORY
    if (path === '/inventory') {
      const u = getUser(req);
      if (!u) return json(res, { error: 'Unauthorized' }, 401);
      const { data } = await db.from('inventory').select('*').eq('user_id', u.userId).order('obtained_at', { ascending: false }).limit(100);
      return json(res, data || []);
    }
    
    // ADMIN ROUTES
    if (path.startsWith('/admin/')) {
      const a = getAdmin(req);
      if (!a) return json(res, { error: 'Admin only' }, 401);
      const sub = path.replace('/admin/', '');
      
      if (sub === 'stats') {
        const { count: uc } = await db.from('users').select('*', { count: 'exact', head: true });
        const { count: ic } = await db.from('items').select('*', { count: 'exact', head: true });
        const { count: bc } = await db.from('banners').select('*', { count: 'exact', head: true });
        const { count: nc } = await db.from('inventory').select('*', { count: 'exact', head: true });
        return json(res, { userCount: uc, itemCount: ic, bannerCount: bc, invCount: nc });
      }
      
      if (sub === 'users') {
        const { data: us } = await db.from('users').select('*').order('id', { ascending: false });
        const { data: inv } = await db.from('inventory').select('user_id');
        const m = {}; (inv || []).forEach(i => m[i.user_id] = (m[i.user_id] || 0) + 1);
        return json(res, (us || []).map(u => ({ ...u, inv_count: m[u.id] || 0 })));
      }
      
      if (sub === 'items') {
        const { data } = await db.from('items').select('*').order('id');
        return json(res, data || []);
      }
      
      // ✅ FIX: Tambahin handler GET /admin/banners
      if (sub === 'banners') {
        const { data } = await db.from('banners').select('*').order('id');
        return json(res, data || []);
      }
      
      if (sub === 'add-balance' && req.method === 'POST') {
        const { userId, gems = 0, wl = 0 } = body;
        const { data: u } = await db.from('users').select('gems, wl').eq('id', userId).single();
        if (!u) return json(res, { error: 'User tidak ada' }, 404);
        await db.from('users').update({ gems: u.gems + gems, wl: u.wl + wl }).eq('id', userId);
        return json(res, { success: true });
      }
      
      if (sub === 'reset-user' && req.method === 'POST') {
        await db.from('users').update({ gems: 0, wl: 0 }).eq('id', body.userId);
        await db.from('inventory').delete().eq('user_id', body.userId);
        return json(res, { success: true });
      }
      
      if (sub === 'delete-user' && req.method === 'POST') {
        await db.from('inventory').delete().eq('user_id', body.userId);
        await db.from('users').delete().eq('id', body.userId);
        return json(res, { success: true });
      }
      
      if (sub === 'save-items' && req.method === 'POST') {
        await db.from('items').delete().neq('id', 0);
        for (const it of body.items) await db.from('items').insert({ name: it.name, icon: it.icon, rarity: it.rarity, drop_rate: it.drop_rate });
        return json(res, { success: true });
      }
      
      if (sub === 'save-banners' && req.method === 'POST') {
        await db.from('banners').delete().neq('id', 0);
        for (const b of body.banners) await db.from('banners').insert({ name: b.name, icon: b.icon, price_gems: b.price_gems, price_wl: b.price_wl });
        return json(res, { success: true });
      }
      
      if (sub === 'export') {
        const { data: users } = await db.from('users').select('id, growid, gems, wl, created_at');
        const { data: items } = await db.from('items').select('*');
        const { data: banners } = await db.from('banners').select('*');
        const { data: inventory } = await db.from('inventory').select('*');
        return json(res, { users, items, banners, inventory });
      }
      
      if (sub === 'import' && req.method === 'POST') {
        const { data } = body;
        if (!data?.items || !data?.banners) return json(res, { error: 'Invalid' }, 400);
        await db.from('inventory').delete().neq('id', 0);
        await db.from('users').delete().neq('id', 0);
        await db.from('items').delete().neq('id', 0);
        await db.from('banners').delete().neq('id', 0);
        for (const it of data.items) await db.from('items').insert({ name: it.name, icon: it.icon, rarity: it.rarity, drop_rate: it.drop_rate });
        for (const b of data.banners) await db.from('banners').insert({ name: b.name, icon: b.icon, price_gems: b.price_gems, price_wl: b.price_wl });
        return json(res, { success: true });
      }
      
      if (sub === 'reset' && req.method === 'POST') {
        await db.from('inventory').delete().neq('id', 0);
        await db.from('users').delete().neq('id', 0);
        return json(res, { success: true });
      }
    }
    
    json(res, { error: 'Not found: ' + path }, 404);
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
};
