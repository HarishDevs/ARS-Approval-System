# AI module: model providers and routing

## Providers

| Code | Provider | API | Address |
|---|---|---|---|
| `CLAUDE` | Anthropic | Messages API with tool use (`x-api-key`, `anthropic-version: 2023-06-01`) | `https://api.anthropic.com/v1/messages` |
| `OPENAI` | OpenAI (ChatGPT) | Chat Completions with function calling (`max_completion_tokens`) | `https://api.openai.com/v1/chat/completions` |
| `GROK` | xAI | OpenAI-compatible (`max_tokens`) | `https://api.x.ai/v1/chat/completions` |
| `DEEPSEEK` | DeepSeek | OpenAI-compatible (`max_tokens`) | `https://api.deepseek.com/chat/completions` |

- **One interface for all four:** `chat(config, { system, turns, tools, maxTokens, timeoutMs })` in `server/ai/providers.ts`. The conversation (questions, answers, tool calls, tool results) is kept in one neutral shape and converted per provider.
- **Switching provider** means changing a setting, never code.

## Settings (Super Admin → AI settings)

| Setting | Default |
|---|---|
| Active provider | NONE |
| Fallback provider | NONE |
| Per provider: API key (encrypted), model | Claude `claude-sonnet-5-5`, DeepSeek `deepseek-chat`; ChatGPT and Grok: enter the model name from the provider's list |
| Per provider: may see business data | NOT_ALLOWED |
| Questions per person per day | 50 |
| Longest question | 4000 characters |
| Answer timeout | 60 seconds |
| Keep conversations | 365 days |

## Routing (`routeFor` in `server/ai/config.ts`)

1. **Candidates:** the active provider, then the fallback. Only providers with a key and a model count.
2. **With data:** if the person has data tools (their modules), the route keeps only providers approved for business data. If any remain, they answer **with** tools.
3. **Without data:** otherwise the route is the configured providers **without** tools. Their instructions say they have no ARS data.
4. **Fallback:** the fallback is tried only after a *retryable* failure: rate limit, unavailable, timeout or unreadable answer. A refused key, an unknown model or a refused request stops at once.
5. **No provider:** the person sees "No AI provider is set up yet" (or the provider's safe error message).

Numbers are always computed by tools (SQL or code), never by the model. The answer's figures are checked against the tool results (`server/ai/validate.ts`).

## Testing a provider

AI settings → **Test** sends one harmless request ("reply OK", no business data). The result shows the time taken and the model that answered, or the safe error. Each test is audited (`AI_PROVIDER_TESTED`).

## Cost

- **Recorded:** tokens in and out per answer (`ai_messages.input_tokens`, `output_tokens`). AI settings → **Usage, last 30 days** shows them per provider.
- **Limits:** cost is bounded by the daily question limit, the 1200-token answer cap and at most 4 tool rounds per answer.
