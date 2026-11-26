import { memo, useState } from 'react';
import { useEventFilters, useTopicFilterActions, useTopicOptions } from '../hooks/useEventSelectors';

/**
 * Visual topic filter builder (#1155).
 *
 * Lets a user add one or more topic conditions by selecting from the topics
 * present in currently loaded events. Each condition is shown as a removable
 * chip; the whole set can also be cleared at once. Selections are written to
 * the shared event filter state, so they apply through the same (local)
 * filtering path as every other event filter.
 */
export const TopicFilterBuilder = memo(function TopicFilterBuilder() {
  const filters = useEventFilters();
  const topicOptions = useTopicOptions();
  const { addTopicFilter, removeTopicFilter, clearTopicFilters } = useTopicFilterActions();
  const [pendingTopic, setPendingTopic] = useState('');

  const selectedTopics = filters.topics ?? [];
  const availableTopics = topicOptions.filter((topic) => !selectedTopics.includes(topic));

  const handleAdd = () => {
    if (!pendingTopic) return;
    addTopicFilter(pendingTopic);
    setPendingTopic('');
  };

  return (
    <div className="topic-filter-builder" aria-label="Topic filter builder">
      <div className="topic-filter-builder__add">
        <label htmlFor="topic-filter-select">Topic</label>
        <select
          id="topic-filter-select"
          value={pendingTopic}
          onChange={(event) => setPendingTopic(event.target.value)}
          disabled={availableTopics.length === 0}
        >
          <option value="">Select a topic…</option>
          {availableTopics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleAdd} disabled={!pendingTopic}>
          Add condition
        </button>
      </div>

      {selectedTopics.length > 0 && (
        <ul className="topic-filter-builder__chips" aria-label="Active topic conditions">
          {selectedTopics.map((topic) => (
            <li key={topic} className="topic-filter-builder__chip">
              <span>{topic}</span>
              <button
                type="button"
                aria-label={`Remove topic condition ${topic}`}
                onClick={() => removeTopicFilter(topic)}
              >
                ×
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={clearTopicFilters}>
              Clear all
            </button>
          </li>
        </ul>
      )}
    </div>
  );
});
