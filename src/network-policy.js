export const STAMP_CALENDARS = Object.freeze([
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
])

// Exact calendar origins that an imported pending proof may cause the browser to query.
// Keep this list deliberately narrow. Imported proof data must never create a new destination.
export const UPGRADE_CALENDARS = Object.freeze([
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
  'https://btc.calendar.catallaxy.com',
])

// Browser verification is a convenience check against a public Esplora endpoint.
// It is not equivalent to independent Bitcoin consensus validation with Bitcoin Core.
export const BITCOIN_EXPLORERS = Object.freeze([
  'https://blockstream.info',
])

export const BLOCKSTREAM_ESPLORA_API = 'https://blockstream.info/api'

export const BROWSER_CONNECT_ORIGINS = Object.freeze([
  ...STAMP_CALENDARS,
  ...UPGRADE_CALENDARS,
  ...BITCOIN_EXPLORERS,
])
