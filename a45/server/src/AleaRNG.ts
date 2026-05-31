export function alea(seed: string): () => number {
  function mash(data: string): () => number {
    let n = 0xefc8249d;
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000;
    }
    return () => (n >>> 0) * 2.3283064365386963e-10;
  }

  const s0 = mash(' ');
  const s1 = mash(' ');
  const s2 = mash(' ');
  const s3 = mash(seed);

  let t = 2091639 * s0() + s3() * 2.3283064365386963e-10;

  return function rnd(): number {
    const x = t;
    t = 2091639 * x + s1() * 2.3283064365386963e-10;
    return x - (x | 0);
  };
}

export class AleaRNG {
  private rnd: () => number;

  constructor(seed: number | string) {
    this.rnd = alea(String(seed));
  }

  next(): number {
    return this.rnd();
  }

  nextRange(min: number, max: number): number {
    return min + this.rnd() * (max - min);
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.nextRange(min, max + 1));
  }
}
