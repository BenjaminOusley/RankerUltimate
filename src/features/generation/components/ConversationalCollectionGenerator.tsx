import { useState, type FormEvent } from 'react';

import type { RankCollection } from '@/domain/models';
import { Button } from '@/shared/components/Button/Button';
import { executeCollectionPlan } from '../api/executeCollectionPlan';
import { planCollectionRequest } from '../api/planCollectionRequest';
import { resolveCollectionRequest } from '../api/resolveCollectionRequest';
import type { CollectionRequestContext } from '../requestTypes';
import styles from './ConversationalCollectionGenerator.module.css';

type ConversationMessage = {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  examples?: string[];
};

type ConversationalCollectionGeneratorProps = {
  onBuilt: (collection: RankCollection) => void;
};

const initialMessage: ConversationMessage = {
  id: 1,
  role: 'assistant',
  text: 'What do you want to rank?',
  examples: [
    'Halo games',
    'Pixar movies',
    'horror movies',
    'PlayStation 2 games',
  ],
};

function nextMessageId(messages: ConversationMessage[]) {
  return messages.reduce((maximum, message) => Math.max(maximum, message.id), 0) + 1;
}

export function ConversationalCollectionGenerator({
  onBuilt,
}: ConversationalCollectionGeneratorProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([initialMessage]);
  const [context, setContext] = useState<CollectionRequestContext | null>(null);
  const [input, setInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addAssistantMessage(text: string, examples: string[] = []) {
    setMessages((current) => [
      ...current,
      {
        id: nextMessageId(current),
        role: 'assistant',
        text,
        examples,
      },
    ]);
  }

  function resetConversation() {
    setMessages([initialMessage]);
    setContext(null);
    setInput('');
    setStatus(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (!text || isWorking) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: nextMessageId(current),
        role: 'user',
        text,
      },
    ]);
    setInput('');
    setError(null);
    setIsWorking(true);
    setStatus('Understanding your request…');

    try {
      const resolution = await resolveCollectionRequest({
        text,
        context,
      });

      setContext(resolution.context);

      if (resolution.status === 'clarification') {
        addAssistantMessage(resolution.question, resolution.examples);
        setStatus(null);
        return;
      }

      setStatus('Finding the right source…');

      const planningResult = await planCollectionRequest(resolution);

      if (planningResult.status === 'clarification') {
        setContext(planningResult.context);
        addAssistantMessage(planningResult.question, planningResult.examples);
        setStatus(null);
        return;
      }

      addAssistantMessage('Got it. I’m building the collection now.');
      setStatus('Building your collection…');

      const collection = await executeCollectionPlan(planningResult);

      setStatus(null);
      onBuilt(collection);
    } catch (caughtError) {
      setStatus(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Collection generation failed.',
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.intro}>
        <h2>Tell RankerUltimate what you want to rank</h2>
        <p>
          Be as broad or specific as you want. If something is ambiguous, I’ll ask
          you to clarify it in your own words.
        </p>
      </div>

      <div className={styles.conversation} aria-live="polite">
        {messages.map((message) => (
          <div
            className={`${styles.message} ${
              message.role === 'user' ? styles.userMessage : styles.assistantMessage
            }`}
            key={message.id}
          >
            <span className={styles.messageLabel}>
              {message.role === 'user' ? 'You' : 'RankerUltimate'}
            </span>
            <p>{message.text}</p>

            {message.examples && message.examples.length > 0 && (
              <div className={styles.examples}>
                {message.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInput(example)}
                    disabled={isWorking}
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {status && <div className={styles.status}>{status}</div>}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="What do you want to rank?"
          maxLength={500}
          disabled={isWorking}
          aria-label="Collection request"
        />
        <Button variant="primary" type="submit" disabled={isWorking || !input.trim()}>
          {isWorking ? 'Working…' : 'Send'}
        </Button>
      </form>

      <div className={styles.footerActions}>
        <Button variant="quiet" size="small" onClick={resetConversation} disabled={isWorking}>
          Start over
        </Button>
      </div>
    </div>
  );
}
