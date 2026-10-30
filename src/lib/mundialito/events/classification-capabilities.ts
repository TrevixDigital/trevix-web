import { phase4Capabilities } from "./capabilities.ts";
export function classificationWritesEnabled(env:Record<string,string|undefined>=process.env) {
  const caps=phase4Capabilities(env);
  return caps.read&&env.SUPABASE_CLASSIFICATION_WRITES_ENABLED==="true"&&(caps.isolated||(
    env.SUPABASE_PHASE4_WRITE_TARGET==="production"&&env.SUPABASE_CLASSIFICATION_PRODUCTION_WRITES_APPROVED==="true"&&env.NEXT_PUBLIC_SUPABASE_URL==="https://vhryyxplhefmpykumvma.supabase.co"));
}
