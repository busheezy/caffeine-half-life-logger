export type CaffeineIntake = {
  id: number;
  label: string | null;
  amountMg: number;
  consumedAt: Date;
  halfLifeHours: number;
};

export function caffeineRemaining(intake: CaffeineIntake, at: Date): number {
  const elapsedMilliseconds = at.getTime() - intake.consumedAt.getTime();

  if (elapsedMilliseconds < 0) {
    return 0;
  }

  const elapsedHours = elapsedMilliseconds / (1000 * 60 * 60);
  const decayExponent = elapsedHours / intake.halfLifeHours;

  return intake.amountMg * Math.pow(0.5, decayExponent);
}

export function totalCaffeineRemaining(intakes: CaffeineIntake[], at: Date): number {
  return intakes.reduce((total, intake) => {
    return total + caffeineRemaining(intake, at);
  }, 0);
}
