# Narrative Source of Truth

Authoritative source: the user's **GAME IDEATION** document (Downloads/GAME IDEATION.pdf), restated in the
browser master plan §1.1. Nothing below overrides it.

## Confirmed facts (from the user)
- Mars, 2043 — ten years after the first human expedition arrived.
- The player is the second astronaut, continuing the previous mission: maintain the base, repair/monitor rovers,
  document the environment and its potential to support human life; larger goal: assess Mars for settlement.
- Food: indoor farming, fungal cultivation (mycoprotein), bioreactor processes.
- Power: nuclear fission; monitor production/consumption; protect essentials in dust storms / solar events.
- Radiation protection is fictional/experimental.
- Rovers survey, sample, gather environmental data, investigate beyond the base.
- Water, oxygen, electricity must be monitored/conserved; life support maintained and repaired.
- Incomplete reports, unexplained observations, unusual data; some records conflict with official reports;
  some locations never fully investigated; questions arise about the previous astronaut's activities.

## What the build currently says (all in `src/missions/records.ts`)
| Record | Status | Notes |
|---|---|---|
| Intro briefing | Faithful | Paraphrases the overview only |
| Assignment (Mission Control) | **Draft** | Task list derived from overview; "Rover R-1", "1.4 km east" are gameplay placement |
| Rover R-1 survey log | **Draft** | Shows a record conflicting with the official report (supports the overview); "DRL-2", entry numbers invented as gameplay labels |
| Core sample DRL-2 | **Draft** | Hydrogen-rich signal + radar void; location flagged "not fully investigated" |
| Cliff base survey | **Draft** | Ends on the uninvestigated location |
| Outpost systems panel | Gameplay abstraction | Illustrative numbers |

## OPEN STORY DECISIONS
- Previous astronaut's identity, activities and fate.
- Crew names, mission chronology.
- What the first expedition found at the cliff base / in the cave; the nature of the conflicting records.
- Whether the underground ice is the central discovery or one step.
- Ending(s).

## Note on earlier material
`Assets/Cinderfall/Resources/Story/story.json` (from the earlier Unity attempt) states that an expedition astronaut
"has disappeared" and frames the mission as a rover recovery. That premise is **not** in the user's overview, so it is
not used. If the fuller story confirms it, it can be adopted.
