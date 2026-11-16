// The reference docs a fresh install starts with. These are written into
// the file storage (R2) once (see ensureDocsSeeded in docs.ts); after that the
// stored files are the source of truth and admins manage them from the prompt page.
//
// Only general facts that are true for every FRC team belong here. Anything
// about Team 972's own robot, shop, or tools is added by mentors in the app.
//
// Each doc's first line is its title — it's what shows up in the doc index
// the AI sees, so keep it short and descriptive.
export const DEFAULT_DOCS: Record<string, string> = {
  "frc-basics.md": `# FRC basics

FIRST Robotics Competition (FRC) is a high-school robotics competition run by FIRST. Each January a new game is revealed at Kickoff. Teams then have a few weeks of build season to design, build, wire, and program a robot for that game. In the spring, teams compete at events, and the season ends at the FIRST Championship. Every team has a permanent number. Matches are played by two alliances of three robots each, and each match starts with a short autonomous period (the robot runs on its own code) followed by driver-controlled play. Beyond the robot, FRC values gracious professionalism, outreach, and team awards.
`,
};
