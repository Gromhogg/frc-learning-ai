// The reference docs a fresh install starts with. These are written into
// DOCS_DIR once (see ensureDocsSeeded in docs.ts); after that the filesystem
// is the source of truth and admins manage the files from the prompt page.
//
// Each doc's first line is its title — it's what shows up in the doc index
// the AI sees, so keep it short and descriptive.
export const DEFAULT_DOCS: Record<string, string> = {
  "frc-basics.md": `# FRC basics

FIRST Robotics Competition is a high-school robotics league. Each January a new game is revealed at Kickoff; teams then design, build, wire, and program a robot over a few intense weeks of build season, compete at district or regional events in March and April, and the season ends at Championship. Teams have permanent numbers. Matches pair alliances of robots and have an autonomous period followed by driver-controlled play. Beyond the robot, FRC emphasizes gracious professionalism, outreach, and award submissions.
`,

  "vertical-mill.md": `# Vertical mill

A mill spins a cutting tool above a workpiece clamped to a table that moves in X, Y, and Z. Work gets held in a vise on parallels, indicated true, then zeroed with an edge finder. Tool choice and spindle speed depend on the material. Safety glasses always; tie back hair; no loose sleeves or jewelry. Chatter, a bad surface finish, or a change in sound means stop and reassess — usually a dull tool, too much stick-out, or a loose setup.
`,

  "engine-lathe.md": `# Engine lathe

A lathe spins the workpiece while a stationary tool cuts it, producing round parts. Stock is held in a chuck; long pieces get supported by the tailstock. Common operations are facing, turning a diameter, drilling, boring, parting, and threading. Never wear gloves near a lathe — they catch and pull your hand in. Stop the machine before clearing chips.
`,

  "cnc-mill.md": `# CNC mill

Same cutting as a manual mill, but a program drives the axes instead of handwheels. You set up and clamp the part, set the work zero so the machine knows where the part is, load the program, and dry-run it above the material before cutting. Never reach into the enclosure while the spindle turns. If anything looks wrong mid-job, hit E-stop.
`,

  "cnc-router.md": `# CNC router

A gantry machine for large flat sheet — plywood, foam, HDPE, polycarbonate, and thin aluminum with mentor approval. It spins much faster than a mill and cuts lighter material. The spoilboard is a sacrificial surface you cut slightly into so parts come free cleanly. Workholding is the main risk: an unsecured sheet becomes a projectile. Hearing protection recommended.
`,

  "waterjet.md": `# Waterjet

Cuts by firing water at extremely high pressure mixed with abrasive garnet. It goes through nearly any material with no heat, so parts don't warp or harden at the edge. It is the fastest way to get complex flat aluminum parts. The stream will cut through a hand instantly — never reach into the cutting zone while the pump runs, and keep bystanders back.
`,

  "cam.md": `# CAM

CAM software turns a CAD model into G-code, the instruction file a CNC machine follows. The flow is CAD to CAM to G-code to machine. You import clean geometry, define the stock, set the work zero to match how you'll set it on the machine, pick the cutting operations, then simulate. Always watch the simulation before cutting — that's where you catch crashes cheaply.
`,

  "cad-in-onshape.md": `# CAD in Onshape

Onshape is cloud CAD, so everyone works in the same document at once with full version history and nothing to lose. Geometry starts as a sketch on a plane; sketches should be fully constrained so parts don't shift unexpectedly. Part Studios hold geometry, Assemblies bring parts together with mates to check fit, and Drawings communicate parts for manufacturing.
`,

  "robot-assembly.md": `# Robot assembly

Read the CAD before picking up a tool — know the part order, since some pieces can't be installed once others are in. Use the right driver for every fastener; the wrong size strips the head. Anything that vibrates needs a nylock nut or thread locker. Never power the robot during mechanical assembly unless a mentor clears it.
`,

  "electrical-wiring.md": `# Electrical wiring

Power flows in a tree: battery, main breaker, power distribution board, individual breakers, then out to motor controllers, the roboRIO, the radio, and sensors. Thicker wire carries more current; thin wire on a high-current run heats up and melts. Always disconnect the battery before working on the electrical system, and never let metal bridge the battery terminals. Neat routing and strain relief prevent most competition failures.
`,
};
