CREATE TABLE `duty_evidence` (
	`shift_id` text NOT NULL,
	`member_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	`review_note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duty_evidence_assignment` ON `duty_evidence` (`shift_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `duty_evidence_expiry` ON `duty_evidence` (`expires_at`);