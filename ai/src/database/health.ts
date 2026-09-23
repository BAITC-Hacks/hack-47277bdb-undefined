import type { AppConfig } from "../config/env.js";
import type { PostgresDatabase } from "./postgres.js";

export interface DependencyHealth {
  readonly name: "database" | "catalog";
  readonly ready: boolean;
  readonly detail?: string;
}

export interface ReadinessReport {
  readonly ready: boolean;
  readonly dependencies: readonly DependencyHealth[];
}

/** Checks the direct PostgreSQL connection and the selected catalog adapter. */
export class ReadinessService {
  public constructor(
    private readonly config: AppConfig,
    private readonly database: PostgresDatabase | undefined
  ) {}

  public async check(): Promise<ReadinessReport> {
    const dependencies: DependencyHealth[] = [];
    if (this.config.DATA_SOURCE === "live") {
      dependencies.push(await this.checkCatalog());
    } else {
      dependencies.push({ name: "catalog", ready: true, detail: "mock adapter" });
    }
    if (this.database === undefined) {
      dependencies.push({
        name: "database",
        ready: false,
        detail: "DATABASE_URL is not configured"
      });
    } else {
      dependencies.push(await this.checkDatabase());
    }
    return { ready: dependencies.every((dependency) => dependency.ready), dependencies };
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    try {
      await this.database?.query("SELECT 1");
      return { name: "database", ready: true };
    } catch {
      return { name: "database", ready: false, detail: "connection failed" };
    }
  }

  private async checkCatalog(): Promise<DependencyHealth> {
    if (
      this.config.EKT_CATALOG_API_URL === undefined ||
      this.config.EKT_CATALOG_API_KEY === undefined
    ) {
      return {
        name: "catalog",
        ready: false,
        detail: "live catalog credentials are not configured"
      };
    }
    return { name: "catalog", ready: true, detail: "configured" };
  }
}
