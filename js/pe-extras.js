/*
 * Additions to the calc (dark mode and sprite panels; first written for the Parallel Emerald copy):
 *   - Dark mode toggle in the header (choice saved per browser).
 *   - Sprite panels under the two Pokemon, laid out like the Null calc:
 *     Team / Box / Trash under Pokemon 1 (your imported sets) and
 *     Opposing Team under Pokemon 2 (every Pokemon of the selected trainer).
 * Loaded after moveset_import.js, so jQuery, pokedex, setdex and the
 * set-selector handlers already exist. The Against the Odds trainer sets and
 * their teams come from js/data/sets/pe-trainers.js (PE_TEAMS, in game-doc order).
 */
(function () {
	var THEME_KEY = 'pe-theme';
	var TEAM_KEY = 'pe-team';
	var TRASH_KEY = 'pe-trash';
	var SPRITE_ROOT = 'https://play.pokemonshowdown.com/sprites/gen5/';

	function store(key, value) {
		try {
			if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
			localStorage.setItem(key, JSON.stringify(value));
		} catch (e) {}
		return null;
	}

	/* ---------- dark mode ---------- */

	var root = document.documentElement;
	var toggle = document.getElementById('theme-toggle');

	function paintToggle() {
		var dark = root.classList.contains('pe-dark');
		toggle.querySelector('.theme-pill-icon').textContent = dark ? '\u2600' : '\u263E';
		toggle.querySelector('.theme-pill-text').textContent = dark ? 'Light mode' : 'Dark mode';
		toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
		toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
	}
	toggle.addEventListener('click', function (e) {
		e.preventDefault();
		var dark = root.classList.toggle('pe-dark');
		store(THEME_KEY, dark ? 'dark' : 'light');
		paintToggle();
	});
	paintToggle();

	/* ---------- sprites ---------- */

	function toID(s) {
		return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
	}

	// Showdown sprite file: base species id, then "-" and the forme id (Charizard-Mega-X -> charizard-megax).
	function spriteIds(species) {
		var data = pokedex && pokedex[species];
		var base = data && data.baseSpecies;
		if (base && species.indexOf(base + '-') === 0) {
			return [toID(base) + '-' + toID(species.slice(base.length + 1)), toID(base)];
		}
		return [toID(species)];
	}

	function spriteImg(species, id, side) {
		var table = window.DIVINE_SPRITES || {};
		var data = pokedex && pokedex[species];
		var img = document.createElement('img');
		img.className = 'sb-pok ' + side;
		img.src = table[species] || (data && table[data.baseSpecies]) || table[species.split('-')[0]] || '';
		img.alt = species;
		img.title = id;
		img.setAttribute('data-id', id);
		return img;
	}

	function splitId(id) {
		var open = id.indexOf(' (');
		return { species: id.slice(0, open), set: id.slice(open + 2, id.lastIndexOf(')')) };
	}

	// Same steps the set dropdown takes, then show the chosen set's name in the closed dropdown.
	function loadSet(side, id) {
		var $input = $('#' + side + ' input.set-selector');
		$input.val(id).change();
		$('#' + side + ' .select2-chosen').first().text(id);
	}

	/* ---------- Team / Box / Trash (Pokemon 1) ---------- */

	function customSets() {
		return store('customsets') || {};
	}

	function customIds() {
		var sets = customSets(), ids = [];
		for (var species in sets) {
			if (species === 'Aegislash-Shield') continue; // imported Aegislash is stored under both formes
			for (var set in sets[species]) ids.push(species + ' (' + set + ')');
		}
		return ids;
	}

	function renderBox() {
		var ids = customIds();
		var team = (store(TEAM_KEY) || []).filter(function (id) { return ids.indexOf(id) !== -1; });
		var trash = (store(TRASH_KEY) || []).filter(function (id) { return ids.indexOf(id) !== -1 && team.indexOf(id) === -1; });
		var box = ids.filter(function (id) { return team.indexOf(id) === -1 && trash.indexOf(id) === -1; });
		[['sb-team', team], ['sb-box', box], ['sb-trash', trash]].forEach(function (zone) {
			var el = document.getElementById(zone[0]);
			el.innerHTML = '';
			zone[1].forEach(function (id) {
				var img = spriteImg(splitId(id).species, id, 'left-side');
				img.draggable = true;
				el.appendChild(img);
			});
		});
		document.getElementById('sb-box-empty').hidden = ids.length > 0;
		markActive();
	}

	function saveZones() {
		function idsIn(zone) {
			return $('#' + zone + ' .sb-pok').map(function () { return this.getAttribute('data-id'); }).get();
		}
		store(TEAM_KEY, idsIn('sb-team'));
		store(TRASH_KEY, idsIn('sb-trash'));
	}

	var dragged = null;
	$(document).on('dragstart', '#team-box .sb-pok', function (e) {
		dragged = this;
		e.originalEvent.dataTransfer.effectAllowed = 'move';
		e.originalEvent.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
	});
	$(document).on('dragend', '#team-box .sb-pok', function () {
		dragged = null;
		$('#team-box .sb-list').removeClass('sb-over');
	});
	$(document).on('dragover', '#team-box .sb-list', function (e) {
		if (!dragged) return;
		e.preventDefault();
		$(this).addClass('sb-over');
	});
	$(document).on('dragleave', '#team-box .sb-list', function () {
		$(this).removeClass('sb-over');
	});
	$(document).on('drop', '#team-box .sb-list', function (e) {
		if (!dragged) return;
		e.preventDefault();
		$(this).removeClass('sb-over');
		if (this.id === 'sb-team' && this.children.length >= 6 && dragged.parentNode !== this) return;
		var before = $(e.target).closest('.sb-pok')[0];
		if (before && before !== dragged && before.parentNode === this) this.insertBefore(dragged, before);
		else this.appendChild(dragged);
		saveZones();
	});

	// Right-click swaps a Pokemon between Team and Box, like the Null calc.
	$(document).on('contextmenu', '#team-box .sb-pok', function (e) {
		e.preventDefault();
		var team = document.getElementById('sb-team');
		var target = this.parentNode === team ? document.getElementById('sb-box') : team;
		if (target === team && team.children.length >= 6) return;
		target.appendChild(this);
		saveZones();
	});

	$(document).on('click', '#team-box .sb-pok', function () {
		loadSet('p1', this.getAttribute('data-id'));
		markActive();
	});

	$('#sb-empty-trash').click(function () {
		var trash = $('#sb-trash .sb-pok').map(function () { return this.getAttribute('data-id'); }).get();
		if (!trash.length) return;
		if (!confirm('Delete the ' + trash.length + ' Pokémon in the trash from your imported sets? This cannot be undone.')) return;
		var sets = customSets();
		var dexes = [SETDEX_SS];
		trash.forEach(function (id) {
			var p = splitId(id);
			[p.species].concat(p.species === 'Aegislash-Blade' ? ['Aegislash-Shield'] : []).forEach(function (sp) {
				if (sets[sp]) {
					delete sets[sp][p.set];
					if (!Object.keys(sets[sp]).length) delete sets[sp];
				}
				dexes.forEach(function (dex) { if (dex[sp]) delete dex[sp][p.set]; });
			});
		});
		if (Object.keys(sets).length) store('customsets', sets);
		else try { localStorage.removeItem('customsets'); } catch (e) {}
		store(TRASH_KEY, []);
		renderBox();
	});

	// Imports go through updateDex(); refresh the box whenever it runs.
	var originalUpdateDex = window.updateDex;
	window.updateDex = function (sets) {
		originalUpdateDex(sets);
		renderBox();
	};

	/* ---------- Opposing Team (Pokemon 2) ---------- */

	// PE_TEAMS: [{name, ids: ["Species (Set)", ...]}] in party order, trainers in the doc's order.
	var TEAMS = window.PE_TEAMS || [];
	var teamOf = {};
	TEAMS.forEach(function (team, i) {
		team.ids.forEach(function (id) { teamOf[id] = i; });
	});

	var currentTeam = -1;

	function renderOpponent() {
		var id = $('#p2 input.set-selector').val() || '';
		if (id in teamOf) currentTeam = teamOf[id];
		var list = document.getElementById('sb-opp');
		list.innerHTML = '';
		var team = TEAMS[currentTeam];
		document.getElementById('sb-trainer-name').textContent = team ? team.name : 'Pick a trainer’s Pokémon in Pokémon 2';
		var options = (window.PE_ABILITY_OPTIONS || {})[id];
		var note = document.getElementById('sb-ability-note');
		note.textContent = options ? 'Ability could be: ' + options.join(' or ') : '';
		note.hidden = !options;
		if (!team) return;
		team.ids.forEach(function (teamId) {
			list.appendChild(spriteImg(splitId(teamId).species, teamId, 'right-side'));
		});
		markActive();
	}

	function stepTrainer(delta) {
		if (!TEAMS.length) return;
		var next = currentTeam === -1 ? (delta > 0 ? 0 : TEAMS.length - 1) : (currentTeam + delta + TEAMS.length) % TEAMS.length;
		loadSet('p2', TEAMS[next].ids[0]);
	}

	$(document).on('click', '#opp-box .sb-pok', function () {
		loadSet('p2', this.getAttribute('data-id'));
	});
	$('#sb-prev').click(function () { stepTrainer(-1); });
	$('#sb-next').click(function () { stepTrainer(1); });

	function markActive() {
		var p1 = $('#p1 input.set-selector').val(), p2 = $('#p2 input.set-selector').val();
		$('#team-box .sb-pok').each(function () { $(this).toggleClass('sb-active', this.getAttribute('data-id') === p1); });
		$('#opp-box .sb-pok').each(function () { $(this).toggleClass('sb-active', this.getAttribute('data-id') === p2); });
	}

	$('#p2 input.set-selector').change(renderOpponent);
	$('#p1 input.set-selector').change(markActive);

	$(function () {
		renderBox();
		renderOpponent();
	});
})();
