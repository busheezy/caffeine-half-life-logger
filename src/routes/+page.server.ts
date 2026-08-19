import { fail } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import type { Actions, PageServerLoad } from "./$types";

const HISTORY_WINDOW_DAYS = 3;
const CAFFEINE_HALF_LIFE_HOURS = 5;

export const load: PageServerLoad = async () => {
  const earliestDate = new Date();

  earliestDate.setDate(earliestDate.getDate() - HISTORY_WINDOW_DAYS);

  const intakes = await prisma.caffeineIntake.findMany({
    where: {
      consumedAt: {
        gte: earliestDate,
      },
    },
    orderBy: {
      consumedAt: "desc",
    },
  });

  return {
    intakes,
    now: new Date(),
  };
};

export const actions: Actions = {
  add: async ({ request }) => {
    const formData = await request.formData();
    const amountMg = Number(formData.get("amountMg"));
    const consumedAtValue = formData.get("consumedAt");
    const rawLabel = formData.get("label");

    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";

    const consumedAt =
      typeof consumedAtValue === "string" ? new Date(consumedAtValue) : new Date(Number.NaN);

    const amountIsValid = Number.isFinite(amountMg) && amountMg > 0 && amountMg <= 1000;

    if (!amountIsValid || Number.isNaN(consumedAt.getTime())) {
      return fail(400, {
        message: "Enter a valid amount and time.",
      });
    }

    await prisma.caffeineIntake.create({
      data: {
        amountMg,
        consumedAt,
        halfLifeHours: CAFFEINE_HALF_LIFE_HOURS,
        label: label || null,
      },
    });

    return {
      success: true,
    };
  },
  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = Number(formData.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return fail(400, {
        message: "That intake could not be removed.",
      });
    }

    await prisma.caffeineIntake.delete({
      where: {
        id,
      },
    });

    return {
      success: true,
    };
  },
};
