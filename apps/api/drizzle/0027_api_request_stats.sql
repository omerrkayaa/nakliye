CREATE TABLE "api_request_stats" (
	"hour" timestamp with time zone NOT NULL,
	"method" varchar(8) NOT NULL,
	"route" varchar(160) NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"status_4xx" integer DEFAULT 0 NOT NULL,
	"status_5xx" integer DEFAULT 0 NOT NULL,
	"total_ms" bigint DEFAULT 0 NOT NULL,
	"max_ms" integer DEFAULT 0 NOT NULL,
	"b50" integer DEFAULT 0 NOT NULL,
	"b100" integer DEFAULT 0 NOT NULL,
	"b200" integer DEFAULT 0 NOT NULL,
	"b300" integer DEFAULT 0 NOT NULL,
	"b500" integer DEFAULT 0 NOT NULL,
	"b1000" integer DEFAULT 0 NOT NULL,
	"b3000" integer DEFAULT 0 NOT NULL,
	"b_inf" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_request_stats_hour_method_route_pk" PRIMARY KEY("hour","method","route")
);
