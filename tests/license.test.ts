import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeActivationCode, verifyActivationCode } from '../src/main/license/verify'

// Les vrais codes ne sont jamais dans le dépôt : ils sont lus depuis le document privé s'il est présent.
const privateFile = join(__dirname, '..', 'docs', 'private', 'activation-codes.json')
const codes: string[] = existsSync(privateFile)
  ? (JSON.parse(readFileSync(privateFile, 'utf8').replace(/^\ufeff/, '')) as { codes: string[] }).codes
  : []

describe('licence — codes d’activation Pro', () => {
  it.runIf(codes.length === 5)('accepte les 5 codes générés', () => {
    const fingerprints = codes.map((c) => verifyActivationCode(c))
    expect(fingerprints.every(Boolean)).toBe(true)
    expect(new Set(fingerprints).size).toBe(5)
  })

  it.runIf(codes.length === 5)('tolère minuscules, espaces et tirets manquants', () => {
    const c = codes[0]
    expect(verifyActivationCode(c.toLowerCase())).toBeTruthy()
    expect(verifyActivationCode(c.replace(/-/g, ''))).toBeTruthy()
    expect(verifyActivationCode(`  ${c.replace(/-/g, ' ')} `)).toBeTruthy()
  })

  it('refuse un code inventé ou mal formé', () => {
    expect(verifyActivationCode('DGP-AAAA-BBBB-CCCC')).toBeNull()
    expect(verifyActivationCode('DGP-XXXX-XXXX-XXXX')).toBeNull()
    expect(verifyActivationCode('')).toBeNull()
    expect(verifyActivationCode('hello')).toBeNull()
  })

  it.runIf(codes.length === 5)('refuse un code valide modifié d’un seul caractère', () => {
    const c = codes[1]
    const altered = c.slice(0, -1) + (c.endsWith('A') ? 'B' : 'A')
    expect(verifyActivationCode(altered)).toBeNull()
  })

  it('normalise la saisie', () => {
    expect(normalizeActivationCode(' dgp-ab12 cd34-ef56 ')).toBe('DGPAB12CD34EF56')
  })

  it('ne contient aucun code en clair dans le code source', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'main', 'license', 'verify.ts'), 'utf8')
    for (const c of codes) {
      expect(src).not.toContain(c)
      expect(src).not.toContain(normalizeActivationCode(c))
    }
  })
})
