import { TemplateService } from './template-service';
import { TemplateRepository } from './template-repository';
import { TemplateChannelType } from '../types/notification-template';

function makeRepository(): jest.Mocked<
  Pick<TemplateRepository, 'create' | 'exists' | 'getById' | 'update'>
> {
  return {
    create: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(false),
    getById: jest.fn(),
    update: jest.fn().mockResolvedValue(true),
  };
}

function validCreateInput() {
  return {
    uniqueKey: 'welcome-email',
    name: 'Welcome Email',
    channelType: TemplateChannelType.EMAIL,
    subjectTemplate: 'Welcome {{name}}',
    bodyTemplate: 'Hello {{name}}, welcome aboard!',
  };
}

describe('TemplateService.createTemplate', () => {
  let repository: jest.Mocked<Pick<TemplateRepository, 'create' | 'exists' | 'getById' | 'update'>>;
  let service: TemplateService;

  beforeEach(() => {
    repository = makeRepository();
    service = new TemplateService(repository as unknown as TemplateRepository);
  });

  it('creates a template when all fields are valid', async () => {
    const result = await service.createTemplate(validCreateInput());
    expect(result.success).toBe(true);
    expect(result.templateId).toBe(1);
    expect(repository.create).toHaveBeenCalled();
  });

  it('rejects a missing name without touching the repository', async () => {
    const input = { ...validCreateInput(), name: '' };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/name/);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only name', async () => {
    const input = { ...validCreateInput(), name: '   ' };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/name/);
  });

  it('rejects an invalid channelType', async () => {
    const input = { ...validCreateInput(), channelType: 'CARRIER_PIGEON' as any };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/channelType/);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a description that is not a string', async () => {
    const input = { ...validCreateInput(), description: 12345 as any };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/description/);
  });

  it('rejects a name longer than 255 characters', async () => {
    const input = { ...validCreateInput(), name: 'a'.repeat(256) };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/name/);
  });

  it('rejects variables that are not an array of strings', async () => {
    const input = { ...validCreateInput(), variables: [1, 2, 3] as any };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/variables/);
  });

  it('rejects a non-object defaultValues', async () => {
    const input = { ...validCreateInput(), defaultValues: 'nope' as any };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/defaultValues/);
  });

  it('still runs template content validation for a valid name/channelType with a bad body', async () => {
    const input = { ...validCreateInput(), bodyTemplate: '' };
    const result = await service.createTemplate(input);
    expect(result.success).toBe(false);
    expect(result.validation?.isValid).toBe(false);
  });
});

describe('TemplateService.updateTemplate', () => {
  let repository: jest.Mocked<Pick<TemplateRepository, 'create' | 'exists' | 'getById' | 'update'>>;
  let service: TemplateService;

  beforeEach(() => {
    repository = makeRepository();
    repository.getById.mockResolvedValue({
      id: 1,
      uniqueKey: 'welcome-email',
      name: 'Welcome Email',
      channelType: TemplateChannelType.EMAIL,
      bodyTemplate: 'Hello {{name}}',
      variables: ['name'],
      defaultValues: {},
      isActive: true,
      version: 1,
    } as any);
    service = new TemplateService(repository as unknown as TemplateRepository);
  });

  it('updates a template when the new name is valid', async () => {
    const result = await service.updateTemplate(1, { name: 'Updated Name' });
    expect(result.success).toBe(true);
    expect(repository.update).toHaveBeenCalled();
  });

  it('rejects an empty name without touching the repository', async () => {
    const result = await service.updateTemplate(1, { name: '' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/name/);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('leaves name/channelType unvalidated when not present in the update payload', async () => {
    const result = await service.updateTemplate(1, { description: 'A short description' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-object defaultValues on update', async () => {
    const result = await service.updateTemplate(1, { defaultValues: 'nope' as any });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/defaultValues/);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
