import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  atlasApiConfigured,
  buildDigestAuthorization,
  md5Hex,
  parseAtlasAccessList,
  parseDigestChallenge,
} from '../src/lib/atlas-digest.js'

describe('Atlas Admin API helpers', () => {
  test('builds a Digest header from the challenge', () => {
    const challenge = parseDigestChallenge(
      'Digest realm="MongoDB Cloud", domain="", nonce="abc123", algorithm=MD5, qop="auth", stale=false',
    )
    assert.equal(challenge.realm, 'MongoDB Cloud')
    assert.equal(challenge.nonce, 'abc123')
    assert.equal(challenge.qop, 'auth')

    const header = buildDigestAuthorization({
      username: 'pk',
      password: 'sk',
      method: 'GET',
      uri: '/api/atlas/v2/groups',
      challenge,
      nc: '00000001',
      cnonce: 'deadbeef',
    })
    const ha1 = md5Hex('pk:MongoDB Cloud:sk')
    const ha2 = md5Hex('GET:/api/atlas/v2/groups')
    const response = md5Hex(`${ha1}:abc123:00000001:deadbeef:auth:${ha2}`)
    assert.match(header, /Digest username="pk"/)
    assert.match(header, new RegExp(`response="${response}"`))
  })

  test('rejects open internet Atlas access lists', () => {
    assert.deepEqual(parseAtlasAccessList(' 1.2.3.4 , 5.6.7.0/29 '), ['1.2.3.4/32', '5.6.7.0/29'])
    assert.throws(() => parseAtlasAccessList('0.0.0.0/0'), /must not include 0.0.0.0\/0/)
    assert.equal(atlasApiConfigured({}), false)
    assert.equal(
      atlasApiConfigured({
        ATLAS_API_PUBLIC_KEY: 'pk',
        ATLAS_API_PRIVATE_KEY: 'sk',
        ATLAS_ORG_ID: 'org',
      }),
      true,
    )
  })
})
