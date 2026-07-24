import { useState, useEffect } from 'react';
import {
  NotificationTemplate,
  CreateNotificationTemplateInput,
  UpdateNotificationTemplateInput
} from '../types/notificationTemplate';
import { templatesApi } from '../services/templatesApi';

type ViewMode = 'list' | 'create' | 'edit' | 'preview';

export function TemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [formData, setFormData] = useState<Partial<CreateNotificationTemplateInput>>({
    type: 'email',
    variables: []
  });
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      const data = await templatesApi.getAll();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleCreateClick() {
    setFormData({ type: 'email', variables: [] });
    setViewMode('create');
  }

  function handleEditClick(template: NotificationTemplate) {
    setSelectedTemplate(template);
    setFormData({ ...template });
    setViewMode('edit');
  }

  function handlePreviewClick(template: NotificationTemplate) {
    setSelectedTemplate(template);
    setPreviewVariables({});
    setViewMode('preview');
  }

  async function handleSave() {
    try {
      if (viewMode === 'create' && formData.id && formData.name && formData.body) {
        await templatesApi.create(formData as CreateNotificationTemplateInput);
      } else if (viewMode === 'edit' && selectedTemplate) {
        await templatesApi.update(selectedTemplate.id, formData as UpdateNotificationTemplateInput);
      }
      await loadTemplates();
      setViewMode('list');
      setSelectedTemplate(null);
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await templatesApi.delete(id);
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  }

  function renderPreview() {
    if (!selectedTemplate) return null;
    const renderedSubject = selectedTemplate.subject
      ? selectedTemplate.subject.replace(/\{\{(\w+)\}\}/g, (_, key) => previewVariables[key] || `{{${key}}}`)
      : '';
    const renderedBody = selectedTemplate.body.replace(/\{\{(\w+)\}\}/g, (_, key) => previewVariables[key] || `{{${key}}}`);

    return (
      <div className="templates-preview">
        <div className="templates-preview__header">
          <h3>Preview: {selectedTemplate.name}</h3>
          <button
            type="button"
            onClick={() => setViewMode('list')}
          >
            Back to List
          </button>
        </div>
        <div className="templates-preview__variables">
          <h4>Variables</h4>
          {selectedTemplate.variables?.map((varName) => (
            <div key={varName} className="templates-preview__variable">
              <label>{varName}:</label>
              <input
                type="text"
                value={previewVariables[varName] || ''}
                onChange={(e) => setPreviewVariables({ ...previewVariables, [varName]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="templates-preview__content">
          <h4>Rendered Template</h4>
          {renderedSubject && (
            <div className="templates-preview__subject">
              <strong>Subject:</strong> {renderedSubject}
            </div>
          )}
          <div className="templates-preview__body">
            <strong>Body:</strong>
            <pre>{renderedBody}</pre>
          </div>
        </div>
      </div>
    );
  }

  function renderForm() {
    return (
      <div className="templates-form">
        <div className="templates-form__header">
          <h3>{viewMode === 'create' ? 'Create Template' : 'Edit Template'}</h3>
          <button
            type="button"
            onClick={() => {
              setViewMode('list');
              setSelectedTemplate(null);
            }}
          >
            Cancel
          </button>
        </div>
        <div className="templates-form__fields">
          <div className="templates-form__field">
            <label>ID</label>
            <input
              type="text"
              value={formData.id || ''}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              disabled={viewMode === 'edit'}
            />
          </div>
          <div className="templates-form__field">
            <label>Name</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="templates-form__field">
            <label>Type</label>
            <select
              value={formData.type || 'email'}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="email">Email</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
          <div className="templates-form__field">
            <label>Subject (optional)</label>
            <input
              type="text"
              value={formData.subject || ''}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            />
          </div>
          <div className="templates-form__field">
            <label>Body</label>
            <textarea
              value={formData.body || ''}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              rows={10}
            />
          </div>
          <div className="templates-form__field">
            <label>Variables (comma-separated)</label>
            <input
              type="text"
              value={(formData.variables || []).join(', ')}
              onChange={(e) => setFormData({
                ...formData,
                variables: e.target.value.split(',').map((v) => v.trim()).filter(Boolean)
              })}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!formData.id || !formData.name || !formData.body}
        >
          Save Template
        </button>
      </div>
    );
  }

  function renderList() {
    if (loading) return <div>Loading templates...</div>;

    return (
      <div className="templates-list">
        <div className="templates-list__header">
          <h3>Templates</h3>
          <button type="button" onClick={handleCreateClick}>
            Create Template
          </button>
        </div>
        <div className="templates-list__items">
          {templates.map((template) => (
            <div key={template.id} className="templates-list__item">
              <div className="templates-list__item-info">
                <h4>{template.name}</h4>
                <p>Type: {template.type}</p>
                {template.subject && <p>Subject: {template.subject}</p>}
                <p className="templates-list__item-body">{template.body.substring(0, 100)}...</p>
              </div>
              <div className="templates-list__item-actions">
                <button type="button" onClick={() => handlePreviewClick(template)}>
                  Preview
                </button>
                <button type="button" onClick={() => handleEditClick(template)}>
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(template.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="templates-list__empty">No templates yet. Create your first template!</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="templates-page">
      {viewMode === 'list' && renderList()}
      {(viewMode === 'create' || viewMode === 'edit') && renderForm()}
      {viewMode === 'preview' && renderPreview()}
    </div>
  );
}
