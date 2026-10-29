/**
 * City weather (spec 2026-10-21-city-weather): one weather for the whole city — the precipitation and
 * its level, never fog (indoors that's haze and smoke). Only weather moods change it; every other mood
 * leaves the room's weather as it is.
 */
import type { Atmosphere, Weather } from './types';

/** The moods that are weather: they set the weather, and the city follows. */
export const WEATHER_MOODS: readonly string[] = ['storm', 'downpour', 'clear-night', 'fog-bank'];

export interface CityWeather {
  weather: Weather;
  level: number;
}

export const weatherOf = (a: Atmosphere): CityWeather => ({ weather: a.weather, level: a.weatherLevel });

export const sameWeather = (a: CityWeather, b: CityWeather): boolean => a.weather === b.weather && a.level === b.level;
