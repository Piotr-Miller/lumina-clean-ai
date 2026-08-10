import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";

import {
  buildInstructions,
  buildPrompt,
  createReviewer,
  lensSchema,
  type Lens,
  type ReviewUnit,
} from "../src/index.js";

interface FinderProviderConfig {
  lens?: unknown;
  model?: unknown;
}

export default class FinderProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;
  private readonly lens: Lens;

  constructor(options: ProviderOptions) {
    const config = (options.config ?? {}) as FinderProviderConfig;
    if (typeof config.model !== "string" || config.model.length === 0) {
      throw new Error("finder-provider requires a non-empty config.model");
    }

    this.providerId = options.id ?? "finder-provider";
    this.model = config.model;
    this.lens = lensSchema.parse(config.lens ?? "general");
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const diff = context?.vars.diff;
    if (typeof diff !== "string" || diff.length === 0) {
      return { error: "The eval case must provide a non-empty diff variable" };
    }
    const projectContext = context?.vars.projectContext;
    if (typeof projectContext !== "string") {
      return { error: "The eval case must provide projectContext as text" };
    }

    const unit: ReviewUnit = { kind: "diff", diff };
    const actualPrompt = JSON.stringify([
      {
        role: "system",
        content: buildInstructions(this.lens, { fileContextTool: false, projectContext }),
      },
      { role: "user", content: buildPrompt(unit) },
    ]);

    try {
      // Deliberately one provider attempt: repeated --no-cache runs should
      // expose schema flakes instead of hiding them behind pipeline retries.
      const reviewer = createReviewer({
        model: this.model,
        lens: this.lens,
        projectContext,
      });
      const result = await reviewer.review(unit);
      return {
        output: JSON.stringify(result),
        prompt: actualPrompt,
        metadata: { lens: this.lens, model: this.model },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        prompt: actualPrompt,
        metadata: { lens: this.lens, model: this.model },
      };
    }
  }
}
