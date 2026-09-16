// lib/guests.js — the unified guest list (ADR-0021).
//
// A night's attendance is ONE array, `night.guests[]`, of entries:
//
//   { id, userId, name, email, invitedBy, invitedAt, response, respondedAt }
//
//   id         stable entry identity (uuid; deterministic `legacy-*` ids for
//              entries reconstructed from the pre-ADR-0021 arrays)
//   userId     Cognito username, or null (anonymous plus-one / unresolved)
//   name       display cache (may be null)
//   email      routing cache, lowercased (may be null)
//   invitedBy  userId of whoever added the entry (host or sponsoring guest)
//   invitedAt  ms epoch
//   response   null = pending, or { type, at } with type in RESPONSE_TYPES
//   respondedAt ms epoch of the LAST change to `response` (including a
//              cancel back to null), or null if never answered. Lets the
//              server keep the newer of two answers from the same person.
//
// Derived sets (pending / attending / declined) are computed HERE and
// nowhere else. Anonymous plus-ones are entries with userId === null; their
// "player key" for game sign-ups is the entry id.
//
// This file is CommonJS for the Lambdas and the MCP server. The frontend
// copy at src/js/data/guests.js is byte-identical apart from the export
// block — tests/guestsParity.test.js enforces that.

const RESPONSE_TYPES = ['playing', 'any_game', 'if_needed', 'spectating', 'declined'];
const YES_TYPES      = ['playing', 'any_game', 'if_needed', 'spectating'];

function lc(s) {
  return typeof s === 'string' && s.includes('@') ? s.trim().toLowerCase() : null;
}

function randomId() {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback for very old runtimes: not cryptographic, but ids only need
  // to be unique within one night's guest list.
  return 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Build a fresh, well-formed entry. */
function newGuest({ id, userId, name, email, invitedBy, invitedAt, response, respondedAt } = {}) {
  const resp = normalizeResponse(response);
  return {
    id:          typeof id === 'string' && id ? id : randomId(),
    userId:      typeof userId === 'string' && userId && !userId.includes('@') ? userId : null,
    name:        typeof name === 'string' && name.trim() ? name.trim() : null,
    email:       lc(email),
    invitedBy:   typeof invitedBy === 'string' && invitedBy ? invitedBy : null,
    invitedAt:   typeof invitedAt === 'number' ? invitedAt : Date.now(),
    response:    resp,
    respondedAt: typeof respondedAt === 'number' ? respondedAt : (resp ? resp.at : null),
  };
}

/** Set (or clear) an entry's response, stamping respondedAt. */
function respond(g, type, at) {
  const t = typeof at === 'number' ? at : Date.now();
  g.response    = type ? { type, at: t } : null;
  g.respondedAt = t;
  return g;
}

function normalizeResponse(r) {
  if (!r || typeof r !== 'object') return null;
  const type = r.type === 'flexible' ? 'if_needed' : r.type; // legacy alias
  if (!RESPONSE_TYPES.includes(type)) return null;
  return { type, at: typeof r.at === 'number' ? r.at : Date.now() };
}

/** Coerce anything vaguely entry-shaped into a valid entry; null if hopeless. */
function sanitizeGuest(g) {
  if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !g.id) return null;
  return newGuest(g);
}

/**
 * Return the night's guest list in canonical form.
 *
 * If `night.guests` is an array it wins (entries sanitized). Otherwise the
 * list is reconstructed from the legacy `invited[]` / `rsvps[]` /
 * `declined[]` arrays with DETERMINISTIC ids, so every client normalizing the
 * same legacy night produces the same entries and the upload validator sees
 * no spurious diff.
 *
 * Pure: does not mutate `night`.
 */
function normalizeGuests(night) {
  if (!night || typeof night !== 'object') return [];

  if (Array.isArray(night.guests)) {
    const out = [];
    const seen = new Set();
    for (const raw of night.guests) {
      const g = sanitizeGuest(raw);
      if (!g || seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
    }
    return out;
  }

  const host = typeof night.hostUserId === 'string' ? night.hostUserId : null;
  const at   = typeof night.lastModified === 'number' ? night.lastModified : 0;
  const out  = [];
  const byUser  = new Map();
  const byEmail = new Map();

  const add = (g) => {
    out.push(g);
    if (g.userId) byUser.set(g.userId, g);
    if (g.email)  byEmail.set(g.email, g);
    return g;
  };

  // rsvps[] — people who said yes (plus their integer plus-one count)
  for (const r of Array.isArray(night.rsvps) ? night.rsvps : []) {
    if (!r || typeof r.userId !== 'string' || !r.userId) continue;
    const isEmailKeyed = r.userId.includes('@');
    const entry = add(newGuest({
      id:        `legacy-${r.userId}`,
      userId:    isEmailKeyed ? null : r.userId,
      name:      r.name,
      email:     isEmailKeyed ? r.userId : r.email,
      invitedBy: host,
      invitedAt: typeof r.timestamp === 'number' ? r.timestamp : at,
      response:  { type: r.type || 'playing', at: typeof r.timestamp === 'number' ? r.timestamp : at },
    }));
    const count = Number.isInteger(r.guests) && r.guests > 0 ? r.guests : 0;
    for (let i = 1; i <= count; i++) {
      // Same synthetic id renderRSVP used to generate, so existing
      // selectedGames[].signedUpPlayers assignments keep matching.
      add(newGuest({
        id:        `${r.userId}_guest_${i}`,
        userId:    null,
        name:      null,
        invitedBy: entry.userId || host,
        invitedAt: entry.invitedAt,
        response:  { type: 'if_needed', at: entry.invitedAt },
      }));
    }
  }

  // declined[] — userIds
  for (const uid of Array.isArray(night.declined) ? night.declined : []) {
    if (typeof uid !== 'string' || !uid || byUser.has(uid)) continue;
    add(newGuest({
      id:        `legacy-${uid}`,
      userId:    uid.includes('@') ? null : uid,
      email:     uid.includes('@') ? uid : null,
      invitedBy: host,
      invitedAt: at,
      response:  { type: 'declined', at },
    }));
  }

  // invited[] — pending; email or userId keys
  for (const key of Array.isArray(night.invited) ? night.invited : []) {
    if (typeof key !== 'string' || !key) continue;
    const email = lc(key);
    if (email ? byEmail.has(email) : byUser.has(key)) continue;
    add(newGuest({
      id:        `legacy-${email || key}`,
      userId:    email ? null : key,
      email,
      invitedBy: host,
      invitedAt: at,
      response:  null,
    }));
  }

  return out;
}

/** Key used in selectedGames[].signedUpPlayers / interestedPlayers. */
function playerKey(g) {
  return g?.userId || g?.id || null;
}

/**
 * Find the entry for a person by userId, falling back to email. This is the
 * ONLY place email↔userId matching happens. Pure — never mutates; use
 * claimGuest() when the match should also record newly-known identity.
 */
function findGuest(guests, { userId, email } = {}) {
  const list = Array.isArray(guests) ? guests : [];
  const em = lc(email);
  let g = userId ? list.find(x => x.userId === userId) : null;
  if (!g && em) g = list.find(x => !x.userId && x.email === em) || list.find(x => x.email === em) || null;
  return g || null;
}

/**
 * findGuest + fill in what we now know about the person: an email-only
 * entry gets its userId on first contact (that is how an email invite
 * becomes a resolved person), a missing email/name cache gets set.
 * Mutates the matched entry; returns it (or null).
 */
function claimGuest(guests, { userId, email, name } = {}) {
  const g = findGuest(guests, { userId, email });
  if (!g) return null;
  const em = lc(email);
  if (userId && !g.userId) g.userId = userId;
  if (em && !g.email) g.email = em;
  if (typeof name === 'string' && name.trim()) g.name = name.trim();
  return g;
}

function pendingGuests(guests)   { return (guests || []).filter(g => !g.response); }
function respondedGuests(guests) { return (guests || []).filter(g => !!g.response); }
function attendingGuests(guests) { return (guests || []).filter(g => g.response && YES_TYPES.includes(g.response.type)); }
function declinedGuests(guests)  { return (guests || []).filter(g => g.response?.type === 'declined'); }
function guestsOfType(guests, type) { return (guests || []).filter(g => g.response?.type === type); }

function isAttending(guests, userId) {
  if (!userId) return false;
  const g = (guests || []).find(x => x.userId === userId);
  return !!(g?.response && YES_TYPES.includes(g.response.type));
}
function hasDeclined(guests, userId) {
  return !!userId && (guests || []).some(x => x.userId === userId && x.response?.type === 'declined');
}
function isPending(guests, userId) {
  return !!userId && (guests || []).some(x => x.userId === userId && !x.response);
}

/**
 * Anonymous plus-ones brought by `sponsorUserId`: no account AND no email.
 * (A friend the sponsor invited by email has an entry with `email` set and
 * their own standing, even before their account is resolved.)
 */
function isPlusOne(g) {
  return !!g && !g.userId && !g.email;
}
function plusOnesOf(guests, sponsorUserId) {
  return (guests || []).filter(g => isPlusOne(g) && g.invitedBy === sponsorUserId);
}

/**
 * Set (or clear, with type === null) the response on the person's entry.
 * Returns the entry, or null if the person has no entry — callers decide
 * whether that means "create one" (host / valid RSVP token) or "refuse".
 */
function setResponse(guests, person, type, { at } = {}) {
  const g = claimGuest(guests, person);
  if (!g) return null;
  return respond(g, type, at);
}

/** Remove entries by predicate; returns the removed entries. */
function removeGuests(night, pred) {
  const list = Array.isArray(night.guests) ? night.guests : [];
  const removed = list.filter(pred);
  night.guests = list.filter(g => !pred(g));
  return removed;
}

// ── Permission rules (ADR-0021 §Sub-decision 1) ────────────────────────────

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function isYes(g) { return !!(g?.response && YES_TYPES.includes(g.response.type)); }

/**
 * Merge a NON-HOST actor's proposed guest list (`after`) onto the server's
 * current one (`before`), keeping everything the actor is not allowed to
 * touch exactly as the server has it. The host's saves bypass this.
 *
 * Why merge instead of reject: the client uploads its whole in-memory copy
 * and never re-fetches first, so by the time Bob clicks "Reserve a seat"
 * the server copy has usually moved on (Carol RSVP'd, the host invited
 * Dan). Rejecting the save would make "Could not save" the normal
 * experience of a PWA tab that stays open. So the actor's permitted deltas
 * are applied and everything else is taken from `before`.
 *
 * Permitted for the actor (rule 2 + 3 of the ADR):
 *   - own entry: `response`, and the name / email / userId caches
 *     (an email-only entry may be claimed by the actor on first contact —
 *     ONLY when `actorEmail`, the authorizer-verified email, matches it;
 *     the client's own claim of an email is never trusted)
 *   - if attending (before or after): ADD entries with invitedBy === actor
 *   - own anonymous plus-ones (invitedBy === actor, no userId, no email):
 *     rename / respond / remove
 * Everything else about other people's entries is silently kept from
 * `before`. Returns { guests } or { error } — errors are reserved for the
 * actor's OWN illegal actions, never for someone else's drift.
 */
function mergeGuestChanges(before, after, actorId, { actorEmail = null, now = Date.now() } = {}) {
  const server = clone(before || []);
  const verifiedEmail = lc(actorEmail);
  // Client clocks are not trusted into the future: a forged respondedAt of
  // MAX_SAFE_INTEGER would otherwise pin the actor's entry forever.
  const clampTs = (t) => (typeof t === 'number' && Number.isFinite(t)) ? Math.min(t, now + 5 * 60 * 1000) : 0;
  const wanted = clone(after  || []);
  const byId   = new Map(wanted.map(g => [g.id, g]));

  // The actor's own entry on the server, or the email-only entry they are
  // claiming (present in `wanted` with their userId under the same id).
  let mine = server.find(g => g.userId === actorId) || null;
  if (!mine) {
    const claimed = wanted.find(g => g.userId === actorId) || null;
    // Match the server's email-only entry against the VERIFIED email, not
    // whatever the client wrote on the entry.
    const onServer = claimed && verifiedEmail
      ? (server.find(g => g.id === claimed.id && !g.userId && g.email === verifiedEmail)
         || server.find(g => !g.userId && g.email === verifiedEmail))
      : null;
    if (onServer) {
      onServer.userId = actorId;
      mine = onServer;
    } else if (claimed) {
      return { error: 'You are not on the guest list for this night' };
    }
  }
  // Prefer the same id; fall back to "whichever entry the client thinks is
  // me" so a stale tab with a differently-normalized own entry still lands
  // its response.
  const mineWanted = mine ? (byId.get(mine.id) || wanted.find(g => g.userId === actorId) || null) : null;
  if (mine && mineWanted) {
    // Newest answer wins: a stale tab (opened before I answered from my
    // phone / the email link) must not revert my newer response.
    const tServer = typeof mine.respondedAt === 'number' ? mine.respondedAt : 0;
    const tClient = clampTs(mineWanted.respondedAt);
    if (tClient >= tServer) {
      mine.response    = normalizeResponse(mineWanted.response);
      mine.respondedAt = tClient || mine.respondedAt || null;
    }
    if (typeof mineWanted.name === 'string' && mineWanted.name.trim()) mine.name = mineWanted.name.trim();
    if (mineWanted.email && !mine.email) mine.email = lc(mineWanted.email);
  }
  const mayBring = isYes(mine) || isYes((before || []).find(g => g.userId === actorId));

  // Own anonymous plus-ones: rename / respond / remove.
  for (let i = server.length - 1; i >= 0; i--) {
    const g = server[i];
    if (!(isPlusOne(g) && g.invitedBy === actorId)) continue;
    const w = byId.get(g.id);
    if (!w) { server.splice(i, 1); continue; }
    if (typeof w.name === 'string' && w.name.trim()) g.name = w.name.trim();
    g.response    = normalizeResponse(w.response);
    g.respondedAt = typeof w.respondedAt === 'number' ? clampTs(w.respondedAt) : g.respondedAt;
  }

  // Additions attributed to the actor (plus-ones or named friends).
  const serverIds = new Set(server.map(g => g.id));
  for (const w of wanted) {
    if (serverIds.has(w.id)) continue;
    if (w.userId === actorId) continue; // handled above (claim) or rejected
    if (w.invitedBy !== actorId) continue; // not theirs to add — dropped
    if (!mayBring) return { error: 'Only attending guests can bring people' };
    // Never add a second entry for a person already on the list.
    if ((w.userId && server.some(g => g.userId === w.userId)) ||
        (w.email  && server.some(g => g.email === w.email))) continue;
    // Rule 2 lets the actor ADD a person, not answer for them: only an
    // anonymous plus-one arrives with a response.
    server.push(newGuest(isPlusOne(w) ? w : { ...w, response: null, respondedAt: null }));
    serverIds.add(w.id);
  }

  return { guests: server };
}

export {
  RESPONSE_TYPES, YES_TYPES,
  newGuest, sanitizeGuest, normalizeGuests, normalizeResponse, respond,
  playerKey, findGuest, claimGuest,
  pendingGuests, respondedGuests, attendingGuests, declinedGuests, guestsOfType,
  isAttending, hasDeclined, isPending, isPlusOne, plusOnesOf,
  setResponse, removeGuests,
  mergeGuestChanges,
};
