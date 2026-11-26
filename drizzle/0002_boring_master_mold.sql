CREATE TABLE `club_week_trash` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`created_at` text NOT NULL,
	`source_revision` integer NOT NULL,
	`removed_weeks` integer NOT NULL,
	`removed_entries` integer NOT NULL,
	`removed_shifts` integer NOT NULL,
	`removed_assignments` integer NOT NULL,
	`payload` text NOT NULL
);
