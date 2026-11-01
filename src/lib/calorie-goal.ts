// Daily calorie goal from the onboarding survey. Runs on the phone; never uses the AI.
//
// 1. Resting energy (BMR) with the Mifflin–St Jeor equation.
// 2. Multiplied by how active the user's day is, plus a bonus for workouts.
// 3. Adjusted for the goal: about 7700 kcal per kg of body weight, so each
//    1 kg per week to lose or gain is about 1100 kcal a day.
// 4. Safety: never below 1200 kcal, at most 1 kg/week to lose and 0.5 kg/week
//    to gain, and under-18s only get a maintenance goal.
// The result is an estimate, not medical advice.

export type Gender = 'female' | 'male' | 'unspecified';
export type Activity = 'sedentary' | 'light' | 'active' | 'very_active';
export type Workouts = '0' | '1-2' | '3-4' | '5+';
export type WeightGoal = 'lose' | 'maintain' | 'gain';

export const KCAL_PER_KG = 7700;
export const MIN_RATE_KG_WEEK = 0.1;
export const MAX_RATE_KG_WEEK: Record<Exclude<WeightGoal, 'maintain'>, number> = {
  lose: 1,
  gain: 0.5,
};

// Everyday movement, not counting workouts
const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.35,
  active: 1.5,
  very_active: 1.65,
};

const WORKOUT_BONUS: Record<Workouts, number> = {
  '0': 0,
  '1-2': 0.075,
  '3-4': 0.15,
  '5+': 0.225,
};

// Mifflin–St Jeor constant: +5 for male, −161 for female, the average for "prefer not to say"
const GENDER_CONSTANT: Record<Gender, number> = {
  male: 5,
  female: -161,
  unspecified: -78,
};

export const MIN_DAILY_GOAL = 1200;
export const ADULT_AGE = 18;

export type GoalInput = {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  workouts: Workouts;
  goal: WeightGoal;
  rateKgPerWeek: number | null; // how much to lose or gain each week
};

export type GoalResult = {
  calories: number; // rounded daily goal
  maintenance: number; // calories to stay the same weight
  limitedToMaintain: boolean; // under 18, so no loss/gain target
  raisedToMinimum: boolean; // the 1200 kcal floor was applied
};

export function calculateCalorieGoal(input: GoalInput): GoalResult {
  const bmr =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + GENDER_CONSTANT[input.gender];
  const factor = Math.min(1.9, ACTIVITY_FACTOR[input.activity] + WORKOUT_BONUS[input.workouts]);
  const maintenance = bmr * factor;

  const limitedToMaintain = input.age < ADULT_AGE && input.goal !== 'maintain';
  let change = 0;
  if (!limitedToMaintain && input.goal !== 'maintain') {
    const amount = dailyChangeForRate(input.goal, input.rateKgPerWeek ?? MIN_RATE_KG_WEEK);
    change = input.goal === 'lose' ? -amount : amount;
  }

  const raw = maintenance + change;
  const raisedToMinimum = raw < MIN_DAILY_GOAL;
  const calories = roundTo50(Math.max(MIN_DAILY_GOAL, raw));
  return { calories, maintenance: roundTo50(maintenance), limitedToMaintain, raisedToMinimum };
}

// Calories a day to add or remove for a weekly change (kept within the safe range)
export function dailyChangeForRate(goal: Exclude<WeightGoal, 'maintain'>, rateKgPerWeek: number) {
  const rate = Math.min(MAX_RATE_KG_WEEK[goal], Math.max(MIN_RATE_KG_WEEK, rateKgPerWeek));
  return (rate * KCAL_PER_KG) / 7;
}

function roundTo50(value: number) {
  return Math.round(value / 50) * 50;
}

export function ageFromBirthYear(birthYear: number, today = new Date()) {
  return today.getFullYear() - birthYear;
}

export function feetInchesToCm(feet: number, inches: number) {
  return (feet * 12 + inches) * 2.54;
}

export function poundsToKg(pounds: number) {
  return pounds * 0.45359237;
}

export function kgToPounds(kg: number) {
  return kg / 0.45359237;
}
