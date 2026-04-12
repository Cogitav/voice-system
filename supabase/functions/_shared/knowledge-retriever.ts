import { getServiceClient } from './supabase-client.ts';
import { callLLMSimple } from './llm-provider.ts';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: string;
}

interface KnowledgeResult {
  found: boolean;
  answer: string | null;
  items_used: string[];
}

export async function retrieveKnowledge(
  question: string,
  empresaId: string,
  agentId: string | null
): Promise<KnowledgeItem[]> {
  const db = getServiceClient();

  let query = db
    .from('agent_knowledge_base')
    .select('id, title, content, type')
    .eq('empresa_id', empresaId)
    .eq('status', 'active');

  if (agentId) {
    query = query.or(`agent_id.eq.${agentId},agent_id.is.null`);
  }

  const { data, error } = await query.limit(20);
  if (error || !data) return [];
  return data as KnowledgeItem[];
}

export async function answerFromKnowledge(
  question: string,
  empresaId: string,
  agentId: string | null,
  agentPrompt: string
): Promise<KnowledgeResult> {
  const items = await retrieveKnowledge(question, empresaId, agentId);

  if (items.length === 0) {
    return { found: false, answer: null, items_used: [] };
  }

  const knowledgeText = items
    .map(item => `[${item.type.toUpperCase()}] ${item.title}:\n${item.content}`)
    .join('\n\n---\n\n');

  try {
    const systemPrompt = `${agentPrompt}

Tens acesso à seguinte base de conhecimento da empresa:

${knowledgeText}

---

Regras:
- Responde APENAS com base no conhecimento fornecido
- Se a informação não estiver disponível, diz que não tens essa informação e sugere contacto direto
- Sê claro, direto e útil
- Responde em português europeu (pt-PT)
- Não inventes informação`;

    const answer = await callLLMSimple(systemPrompt, question, empresaId, 'text');

    return {
      found: true,
      answer,
      items_used: items.map(i => i.id),
    };
  } catch {
    return { found: false, answer: null, items_used: [] };
  }
}
