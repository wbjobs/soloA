const SUN_LUMINOSITY = 3.828e26;
const SUN_RADIUS = 6.957e8;
const SUN_TEMPERATURE = 5778;
const AU = 1.496e11;
const STEFAN_BOLTZMANN = 5.67e-8;


export interface StarParameters {
  name: string;
  mass: number;
  radius: number;
  luminosity: number;
  temperature: number;
  color: string;
}


export interface HabitableZone {
  starIndex: number;
  innerRadius: number;
  outerRadius: number;
  optimalRadius: number;
}


export function estimateStarParameters(
  name: string,
  mass: number,
  radius?: number,
  color?: string
): StarParameters {
  if (radius === undefined) {
    const massRatio = mass / 1.989e30;
    if (massRatio > 1.5) {
      radius = SUN_RADIUS * Math.pow(massRatio, 1.4);
    } else {
      radius = SUN_RADIUS * Math.pow(massRatio, 0.8);
    }
  }

  let luminosity: number;
  const massRatio = mass / 1.989e30;

  if (massRatio < 0.5) {
    luminosity = SUN_LUMINOSITY * 0.23 * Math.pow(massRatio, 2.3);
  } else if (massRatio < 2.0) {
    luminosity = SUN_LUMINOSITY * Math.pow(massRatio, 4);
  } else {
    luminosity = SUN_LUMINOSITY * 1.4 * Math.pow(massRatio, 3.5);
  }

  const surfaceArea = 4 * Math.PI * radius * radius;
  const temperature = Math.pow(luminosity / (surfaceArea * STEFAN_BOLTZMANN), 0.25);

  let starColor = color || '#fdb813';
  if (temperature < 3500) {
    starColor = '#ff6b6b';
  } else if (temperature < 5000) {
    starColor = '#ffaa00';
  } else if (temperature < 6000) {
    starColor = '#fdb813';
  } else if (temperature < 7500) {
    starColor = '#ffffff';
  } else if (temperature < 10000) {
    starColor = '#aaccff';
  } else {
    starColor = '#88aaff';
  }

  return {
    name,
    mass,
    radius,
    luminosity,
    temperature,
    color: starColor
  };
}


export function computeHabitableZone(starParams: StarParameters): HabitableZone {
  const luminosityRatio = starParams.luminosity / SUN_LUMINOSITY;

  const innerRadius = 0.95 * AU * Math.sqrt(luminosityRatio);
  const outerRadius = 1.67 * AU * Math.sqrt(luminosityRatio);
  const optimalRadius = 1.0 * AU * Math.sqrt(luminosityRatio);

  return {
    starIndex: 0,
    innerRadius,
    outerRadius,
    optimalRadius
  };
}


export function identifyStars(
  bodies: { name: string; mass: number; radius: number; color: string }[]
): StarParameters[] {
  const stars: StarParameters[] = [];

  bodies.forEach((body, index) => {
    if (body.mass >= 0.1 * 1.989e30) {
      const params = estimateStarParameters(
        body.name,
        body.mass,
        body.radius,
        body.color
      );
      stars.push(params);
    }
  });

  if (stars.length === 0 && bodies.length > 0) {
    const maxMassIndex = bodies.reduce(
      (maxIdx, body, idx, arr) => body.mass > arr[maxIdx].mass ? idx : maxIdx,
      0
    );
    const body = bodies[maxMassIndex];
    stars.push(estimateStarParameters(
      body.name,
      body.mass,
      body.radius,
      body.color
    ));
  }

  return stars;
}


export function normalizeForRendering(
  values: number[],
  scale: number = 1.0
): number {
  if (values.length === 0) return scale;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;

  if (range === 0) return scale;

  return scale;
}
