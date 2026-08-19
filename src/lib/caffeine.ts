export type CaffeineIntake = {
  id: number;
  label: string | null;
  amountMg: number;
  consumedAt: Date;
  isDistributed: boolean;
  finishedAt: Date | null;
  halfLifeHours: number;
};

export function caffeineRemaining(intake: CaffeineIntake, at: Date, currentTime = at): number {
  const startTime = intake.consumedAt.getTime();
  const endTime = intake.isDistributed
    ? (intake.finishedAt?.getTime() ?? currentTime.getTime())
    : startTime;
  const atTime = at.getTime();
  const halfLifeMilliseconds = intake.halfLifeHours * 60 * 60 * 1000;
  const decayRate = Math.LN2 / halfLifeMilliseconds;

  if (!intake.isDistributed) {
    return atTime < startTime ? 0 : intake.amountMg * Math.exp(-decayRate * (atTime - startTime));
  }

  if (atTime <= startTime) {
    return 0;
  }

  const consumedThrough = Math.min(atTime, endTime);

  if (consumedThrough <= startTime) {
    return 0;
  }

  const duration = Math.max(endTime - startTime, 1);

  return (
    (intake.amountMg / duration / decayRate) *
    (Math.exp(-decayRate * (atTime - consumedThrough)) -
      Math.exp(-decayRate * (atTime - startTime)))
  );
}

export function totalCaffeineRemaining(
  intakes: CaffeineIntake[],
  at: Date,
  currentTime = at,
): number {
  return intakes.reduce((total, intake) => {
    return total + caffeineRemaining(intake, at, currentTime);
  }, 0);
}
