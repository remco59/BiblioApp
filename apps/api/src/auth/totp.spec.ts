import { base32Decode, base32Encode, hotp, otpauthUrl, totp, verifyTotp } from './totp';

describe('totp', () => {
  // RFC 4226, bijlage D: geheim "12345678901234567890"
  const secret = Buffer.from('12345678901234567890');
  it('klopt met de HOTP-testvectoren (RFC 4226)', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expected.forEach((code, i) => expect(hotp(secret, i)).toBe(code));
  });

  it('klopt met de TOTP-testvector (RFC 6238, t=59 → 94287082 → 6 cijfers 287082)', () => {
    const b32 = base32Encode(secret);
    expect(totp(b32, 59_000)).toBe('287082');
    expect(totp(b32, 1111111109_000, 8)).toBe('07081804');
  });

  it('base32 roundtript', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI'); // RFC 4648
    expect(() => base32Decode('abc1')).toThrow();
  });

  it('verifieert binnen ±1 stap en geeft de stap terug; buiten het venster niet', () => {
    const b32 = base32Encode(secret);
    const t = 1_700_000_000_000;
    const code = totp(b32, t);
    const step = Math.floor(t / 30000);
    expect(verifyTotp(b32, code, t)).toBe(step);
    expect(verifyTotp(b32, code, t + 30_000)).toBe(step);
    expect(verifyTotp(b32, code, t - 30_000)).toBe(step);
    expect(verifyTotp(b32, code, t + 120_000)).toBeNull();
    expect(verifyTotp(b32, 'abcdef', t)).toBeNull();
    expect(verifyTotp(b32, '12345', t)).toBeNull();
  });

  it('bouwt een otpauth-URL', () => {
    expect(otpauthUrl('ABC', 'a@b.nl')).toBe(
      'otpauth://totp/BiblioApp:a%40b.nl?secret=ABC&issuer=BiblioApp&algorithm=SHA1&digits=6&period=30',
    );
  });
});
