ALTER TABLE "incident_monitor" DROP CONSTRAINT "incident_monitor_incident_id_monitor_id_pk";--> statement-breakpoint
ALTER TABLE "maintenance_window_monitor" DROP CONSTRAINT "maintenance_window_monitor_window_id_monitor_id_pk";--> statement-breakpoint
ALTER TABLE "monitor_notification_channel" DROP CONSTRAINT "monitor_notification_channel_monitor_id_channel_id_pk";--> statement-breakpoint
ALTER TABLE "incident_monitor" ADD CONSTRAINT "im_pk" PRIMARY KEY("incident_id","monitor_id");--> statement-breakpoint
ALTER TABLE "maintenance_window_monitor" ADD CONSTRAINT "mwm_pk" PRIMARY KEY("window_id","monitor_id");--> statement-breakpoint
ALTER TABLE "monitor_notification_channel" ADD CONSTRAINT "mnc_pk" PRIMARY KEY("monitor_id","channel_id");