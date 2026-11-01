import { inArray, not } from "drizzle-orm";

import { ENDED_INCIDENT_STATUSES } from "../constants/status";
import { incident } from "./db/schema";

/** An incident that has ended. Its `resolvedAt` is unreliable: reopening keeps the old one. */
export const incidentEnded = inArray(incident.status, [...ENDED_INCIDENT_STATUSES]);

export const incidentActive = not(incidentEnded);
