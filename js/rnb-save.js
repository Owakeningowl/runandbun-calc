/* Sync from mGBA: reads Run & Bun's .sav in this page (it is never uploaded anywhere) and fills Team / Box.
   Chrome and Edge: link the save once. The page keeps the link and re-reads the file whenever mGBA writes it, which
   happens each time you save in the game, so no Lua script is needed. Other browsers: pick the file each time.
   Format: Gen 3 flash save (two slots of 14 sections), Pokemon in the standard 80/100-byte layout. Run & Bun keeps a
   nature override and an ability slot in spare bits, read the same way as its own Lua exporter (runandbun.lua). */
(function () {
	var IDS = window.RNB_IDS;
	if (!IDS) return;
	var ORDER = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 3, 1, 2], [0, 2, 3, 1], [0, 3, 2, 1], [1, 0, 2, 3], [1, 0, 3, 2],
		[2, 0, 1, 3], [3, 0, 1, 2], [2, 0, 3, 1], [3, 0, 2, 1], [1, 2, 0, 3], [1, 3, 0, 2], [2, 1, 0, 3], [3, 1, 0, 2],
		[2, 3, 0, 1], [3, 2, 0, 1], [1, 2, 3, 0], [1, 3, 2, 0], [2, 1, 3, 0], [3, 1, 2, 0], [2, 3, 1, 0], [3, 2, 1, 0]];
	var HP_TYPES = ['Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass',
		'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
	var BOX_SLOTS = 420;

	function u16(d, o) { return d[o] | d[o + 1] << 8; }
	function u32(d, o) { return (d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24) >>> 0; }

	// The newer of the two save slots, as {section id: its 3968 data bytes}
	function sections(sav) {
		var best = null;
		[0, 0xE000].forEach(function (base) {
			var secs = {}, index = -1, n = 0;
			for (var i = 0; i < 14; i++) {
				var off = base + i * 0x1000;
				if (off + 0x1000 > sav.length || u32(sav, off + 0xFF8) !== 0x08012025) return;
				secs[u16(sav, off + 0xFF4)] = sav.subarray(off, off + 0xF80);
				index = u32(sav, off + 0xFFC);
				n++;
			}
			if (n === 14 && (!best || index > best.index)) best = {index: index, secs: secs};
		});
		if (!best) throw new Error('format');
		return best.secs;
	}

	function join(secs, ids) {
		var out = new Uint8Array(ids.length * 0xF80);
		ids.forEach(function (id, i) { out.set(secs[id], i * 0xF80); });
		return out;
	}

	function expFor(n, c) {
		var n3 = n * n * n;
		switch (c) {
		case 1: return n <= 50 ? Math.floor((100 - n) * n3 / 50) : n <= 68 ? Math.floor((150 - n) * n3 / 100) :
			n <= 98 ? Math.floor(Math.floor((1911 - 10 * n) / 3) * n3 / 500) : Math.floor((160 - n) * n3 / 100);
		case 2: return n < 15 ? Math.floor((Math.floor((n + 1) / 3) + 24) * n3 / 50) : n <= 36 ? Math.floor((n + 14) * n3 / 50) :
			Math.floor((Math.floor(n / 2) + 32) * n3 / 50);
		case 3: return Math.floor(6 * n3 / 5) - 15 * n * n + 100 * n - 140;
		case 4: return Math.floor(4 * n3 / 5);
		case 5: return Math.floor(5 * n3 / 4);
		default: return n3;
		}
	}

	// One boxed Pokemon: null if empty, 'bad' if its checksum fails
	function boxMon(d, o) {
		var pid = u32(d, o), otid = u32(d, o + 4);
		if (!pid && !otid) return null;
		var key = (pid ^ otid) >>> 0, w = [], sum = 0, i;
		for (i = 0; i < 12; i++) {
			w[i] = (u32(d, o + 32 + i * 4) ^ key) >>> 0;
			sum = (sum + (w[i] & 0xFFFF) + (w[i] >>> 16)) & 0xFFFF;
		}
		if (sum !== u16(d, o + 28)) return 'bad';
		var order = ORDER[pid % 24], ss = [];
		for (i = 0; i < 4; i++) ss[i] = w.slice(order[i] * 3, order[i] * 3 + 3);
		var species = ss[0][0] & 0xFFFF;
		if (!species || species >= IDS.species.length || !IDS.species[species]) return null;
		var ivw = ss[3][1], slot = ss[3][2] >>> 29 & 3, hidden = ss[0][2] >>> 16 & 0x1F;
		if (d[o + 19] >> 2 & 1) return null;                              // an egg (the flag byte the Lua exporter reads)
		var ivs = [ivw & 31, ivw >>> 5 & 31, ivw >>> 10 & 31, ivw >>> 15 & 31, ivw >>> 20 & 31, ivw >>> 25 & 31]; // HP Atk Def Spe SpA SpD
		var evs = [ss[2][0] & 255, ss[2][0] >>> 8 & 255, ss[2][0] >>> 16 & 255, ss[2][0] >>> 24, ss[2][1] & 255, ss[2][1] >>> 8 & 255];
		var ability = IDS.abilities[species * 3 + slot];
		if (!ability || ability === 'None') ability = IDS.abilities[species * 3];
		var moves = [ss[1][0] & 0xFFFF, ss[1][0] >>> 16, ss[1][1] & 0xFFFF, ss[1][1] >>> 16].filter(Boolean).map(function (m) {
			var name = IDS.moves[m] || '';
			if (name === 'Hidden Power') {
				var bits = (ivs[0] & 1) + 2 * (ivs[1] & 1) + 4 * (ivs[2] & 1) + 8 * (ivs[3] & 1) + 16 * (ivs[4] & 1) + 32 * (ivs[5] & 1);
				name += ' ' + HP_TYPES[Math.floor(bits * 5 / 21)];
			}
			return name;
		}).filter(Boolean);
		return {
			id: species, exp: ss[0][1], name: IDS.species[species], item: IDS.items[ss[0][0] >>> 16] || '',
			nature: hidden === 26 || hidden >= 25 ? IDS.natures[pid % 25] : IDS.natures[hidden], ability: ability, moves: moves,
			ivs: {hp: ivs[0], at: ivs[1], df: ivs[2], sp: ivs[3], sa: ivs[4], sd: ivs[5]},
			evs: {hp: evs[0], at: evs[1], df: evs[2], sp: evs[3], sa: evs[4], sd: evs[5]}
		};
	}

	function toSet(m, level, label) {
		var set = {level: level, ability: m.ability, nature: m.nature, moves: m.moves, ivs: m.ivs, evs: m.evs, isCustomSet: true};
		if (m.item) set.item = m.item;
		return {name: m.name, label: label, set: set};
	}

	function parse(sav) {
		var secs = sections(sav), sb1 = join(secs, [1, 2, 3, 4]), store = join(secs, [5, 6, 7, 8, 9, 10, 11, 12, 13]);
		var party = [], box = [], skipped = 0, i, m;
		for (i = 0; i < Math.min(sb1[0x234], 6); i++) {
			m = boxMon(sb1, 0x238 + i * 100);
			if (m === 'bad') skipped++;
			else if (m) party.push(toSet(m, sb1[0x238 + i * 100 + 84], 'Save Team ' + (i + 1)));
		}
		for (i = 0; i < BOX_SLOTS; i++) {
			m = boxMon(store, 4 + i * 80);
			if (m === 'bad') { skipped++; continue; }
			if (!m) continue;
			var curve = IDS.curves[m.id] || 0, level = 1;
			while (level < 100 && m.exp >= expFor(level + 1, curve)) level++;
			box.push(toSet(m, level, 'Save Box ' + (Math.floor(i / 30) + 1) + '-' + (i % 30 + 1)));
		}
		return {party: party, box: box, skipped: skipped};
	}
	window.RnbSave = {parse: parse};

	function say(text, bad) {
		var el = document.getElementById('sb-save-status');
		if (!el) return;
		el.textContent = text;
		el.hidden = false;
		el.classList.toggle('sb-save-bad', !!bad);
	}

	function install(result) {
		var sets = {};
		try { sets = JSON.parse(localStorage.customsets || '{}'); } catch (e) {}
		Object.keys(sets).forEach(function (species) {           // a new sync replaces the last one, and keeps what you imported by hand
			Object.keys(sets[species]).forEach(function (label) {
				if (label.indexOf('Save ') === 0) {
					delete sets[species][label];
					if (window.SETDEX_SS && SETDEX_SS[species]) delete SETDEX_SS[species][label];
				}
			});
			if (!Object.keys(sets[species]).length) delete sets[species];
		});
		result.party.concat(result.box).forEach(function (s) {
			sets[s.name] = sets[s.name] || {};
			sets[s.name][s.label] = s.set;
		});
		try {
			localStorage.customsets = JSON.stringify(sets);
			localStorage.setItem('pe-team', JSON.stringify(result.party.map(function (s) { return s.name + ' (' + s.label + ')'; })));
		} catch (e) {}
		window.updateDex(sets);
	}

	function load(bytes, when) {
		var result = parse(bytes);
		if (!result.party.length && !result.box.length) throw new Error('empty');
		install(result);
		say('Synced' + (when ? ' at ' + when : '') + ': ' + result.party.length + ' in your team, ' + result.box.length +
			' in your boxes' + (result.skipped ? ' (skipped ' + result.skipped + ' damaged slot' + (result.skipped === 1 ? '' : 's') + ')' : '') + '.');
	}

	function problem(e) {
		say(e && e.message === 'empty' ? 'That save has no Pokémon yet. Catch one and save in the game.'
			: 'That doesn’t look like a Run & Bun save. Pick “Run and Bun.sav”, next to the game file.', true);
	}

	/* ---------- linked save (Chrome / Edge) ---------- */
	var linkButton = document.getElementById('sb-link-save'), syncButton = document.getElementById('sb-sync-now');
	var pickLabel = document.getElementById('sb-pick-save'), handle = null, lastModified = 0, timer = null;
	var canLink = typeof window.showOpenFilePicker === 'function' && window.indexedDB;

	function db(mode, fn) {
		return new Promise(function (resolve, reject) {
			var req = indexedDB.open('rnb-sync', 1);
			req.onupgradeneeded = function () { req.result.createObjectStore('handles'); };
			req.onerror = function () { reject(req.error); };
			req.onsuccess = function () {
				var tx = req.result.transaction('handles', mode), store = tx.objectStore('handles'), r = fn(store);
				tx.oncomplete = function () { resolve(r && r.result); };
				tx.onerror = function () { reject(tx.error); };
			};
		});
	}

	function poll() {
		if (!handle || document.visibilityState !== 'visible') return;
		handle.getFile().then(function (file) {
			if (file.lastModified === lastModified) return;
			lastModified = file.lastModified;
			return file.arrayBuffer().then(function (buf) {
				try { load(new Uint8Array(buf), new Date(file.lastModified).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})); }
				catch (e) { problem(e); }
			});
		}).catch(function () {
			clearInterval(timer);
			timer = null;
			syncButton.hidden = false;
			say('Lost access to the save. Press Sync now to allow it again.', true);
		});
	}

	function start() {
		syncButton.hidden = true;
		linkButton.textContent = 'Link a different save';
		if (!timer) timer = setInterval(poll, 2000);
		poll();
	}

	function allow() {
		return handle.requestPermission({mode: 'read'}).then(function (state) {
			if (state === 'granted') start();
			else say('The browser didn’t allow reading the save.', true);
		});
	}

	if (canLink) {
		pickLabel.hidden = true;
		linkButton.addEventListener('click', function () {
			window.showOpenFilePicker({types: [{description: 'Save file', accept: {'application/octet-stream': ['.sav']}}]})
				.then(function (picked) {
					handle = picked[0];
					lastModified = 0;
					return db('readwrite', function (s) { return s.put(handle, 'save'); }).then(start);
				}).catch(function (e) { if (e && e.name !== 'AbortError') problem(e); });
		});
		syncButton.addEventListener('click', function () { if (handle) allow(); });
		db('readonly', function (s) { return s.get('save'); }).then(function (saved) {
			if (!saved) return;
			handle = saved;
			linkButton.textContent = 'Link a different save';
			return handle.queryPermission({mode: 'read'}).then(function (state) {
				if (state === 'granted') start();
				else {
					syncButton.hidden = false;
					say('Press Sync now to keep reading ' + handle.name + '.');
				}
			});
		}).catch(function () {});
		document.addEventListener('visibilitychange', poll);
	} else {
		linkButton.hidden = true;
	}

	/* ---------- one-off pick (any browser) ---------- */
	document.addEventListener('change', function (event) {
		if (event.target.id !== 'sb-save-file' || !event.target.files[0]) return;
		var file = event.target.files[0], reader = new FileReader();
		reader.onerror = function () { say('That file couldn’t be read. Try picking it again.', true); };
		reader.onload = function () {
			try { load(new Uint8Array(reader.result)); } catch (e) { problem(e); }
			event.target.value = '';
		};
		reader.readAsArrayBuffer(file);
	});
})();
