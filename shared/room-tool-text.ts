/** Her four room tools' descriptions: Lowlight's server (tools.ts) and the SillyTavern package both use these. */
export const ROOM_TOOL_TEXT = {
  apply_mood:
    "Set one of the current scene's moods: a named look (every scene has late, quiet and tense, plus its own) that sets lights, ambient and fog together; only storm, downpour, clear-night and fog-bank change the weather. Prefer this over adjusting lights one by one for a mood change. Their names are listed after moods: in the [room: …] line. Changes ease in over `duration` seconds (default 1.5).",
  set_atmosphere:
    "Change the room's weather, weather intensity and fog. `weather_level` and `fog` run from 0 to 1 (the room line shows them as percentages). Changes ease in over `duration` seconds (default 1.5).",
  set_light:
    "Change one of the room's named lights. `light_id` takes the id or the quoted label from the [room: …] line (e.g. monitor or \"intake terminal glow\"). `intensity` and `flicker` run from 0 to 1, and the room line shows them as percentages (45% is 0.45). Turning the room's own lights down or off dims the room with them; a light marked `outside` (the city through a window) is light from outside and stays as it is unless you name it. Changes ease in over `duration` seconds (default 1.5). The result says `applied:` and shows the room as it now is.",
  go_to:
    'Take them both to one of your places, or through one of the ways out of the room you are in (the [room] line\'s ways out). Use list_scenes for the ids (full names like karasu/noodle-stall; a bare name like noodle-stall works when only one room has it). Anywhere else, they walk you both there on the city map. `transition` picks how the change happens: `fade` (default, 1.2s) or `glitch` (0.6s).',
} as const;
