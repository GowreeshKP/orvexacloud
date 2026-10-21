import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ownerPortalPath, tokensMatch } from '../src/lib/owner-portal.js'

describe('owner portal URLs', () => {
  test('uses a permanent per-store owner path', () => {
    assert.equal(ownerPortalPath('lunar'), '/t/lunar/owner')
    assert.equal(ownerPortalPath('SilkHaus'), '/t/silkhaus/owner')
  })

  test('compares tokens in constant time and rejects mismatches', () => {
    const token = 'a'.repeat(64)
    assert.equal(tokensMatch(token, token), true)
    assert.equal(tokensMatch(token, 'b'.repeat(64)), false)
    assert.equal(tokensMatch('', token), false)
  })
})
