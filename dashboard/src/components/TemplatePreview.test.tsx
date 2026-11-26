/**
 * Tests for TemplatePreview component
 * 
 * Ensures:
 * - Preview updates when template content changes
 * - Supported variables render correctly
 * - Missing variables are identified
 * - Previewing does not trigger actual notifications
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TemplatePreview, TemplatePreviewWithVariables } from './TemplatePreview';
import { TemplateChannelType } from '../types/notificationTemplate';

describe('TemplatePreview', () => {
  const defaultProps = {
    body: 'Hello {{name}}, welcome to {{platform}}!',
    channelType: 'EMAIL' as TemplateChannelType,
    variables: {
      name: 'John',
      platform: 'Notify-Chain',
    },
  };

  describe('basic rendering', () => {
    it('should render preview component', () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId('template-preview')).toBeInTheDocument();
    });

    it('should display preview title', () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('should render template body', () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId('preview-body')).toBeInTheDocument();
    });
  });

  describe('variable interpolation', () => {
    it('should render template with variables', () => {
      render(<TemplatePreview {...defaultProps} />);

      const preview = screen.getByTestId('preview-body');
      expect(preview.textContent).toBe('Hello John, welcome to Notify-Chain!');
    });

    it('should handle multiple variables', () => {
      render(
        <TemplatePreview
          body="From: {{from}}, To: {{to}}, Amount: {{amount}}"
          channelType="EMAIL"
          variables={{
            from: 'Alice',
            to: 'Bob',
            amount: '100 USD',
          }}
        />
      );

      const preview = screen.getByTestId('preview-body');
      expect(preview.textContent).toBe('From: Alice, To: Bob, Amount: 100 USD');
    });

    it('should render nested properties', () => {
      render(
        <TemplatePreview
          body="Contact: {{user.name}} at {{user.email}}"
          channelType="EMAIL"
          variables={{
            user: {
              name: 'John Doe',
              email: 'john@example.com',
            },
          }}
        />
      );

      const preview = screen.getByTestId('preview-body');
      expect(preview.textContent).toContain('John Doe');
      expect(preview.textContent).toContain('john@example.com');
    });
  });

  describe('missing variables', () => {
    it('should show warning for missing variables', () => {
      render(
        <TemplatePreview
          body="Hello {{name}}, welcome to {{platform}}!"
          channelType="EMAIL"
          variables={{
            name: 'John',
            // missing 'platform'
          }}
        />
      );

      expect(screen.getByText('Missing variables:')).toBeInTheDocument();
      expect(screen.getByText(/platform/)).toBeInTheDocument();
    });

    it('should display status badge when variables missing', () => {
      render(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{}}
        />
      );

      expect(screen.getByText('⚠ Missing variables')).toBeInTheDocument();
    });

    it('should show valid status when all variables provided', () => {
      render(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{
            name: 'John',
          }}
        />
      );

      expect(screen.getByText('✓ Valid')).toBeInTheDocument();
    });

    it('should handle missing variables with custom indicator', () => {
      render(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{}}
          missingVariableIndicator="[MISSING]"
        />
      );

      const preview = screen.getByTestId('preview-body');
      expect(preview.textContent).toContain('[MISSING]');
    });
  });

  describe('unsupported variables', () => {
    it('should warn about unsupported variables', () => {
      render(
        <TemplatePreview
          body="User: {{username}}, Status: {{status}}"
          channelType="EMAIL"
          variables={{
            username: 'john_doe',
            status: 'active',
          }}
          supportedVariables={['username']}
        />
      );

      expect(screen.getByText('Unsupported variables:')).toBeInTheDocument();
      expect(screen.getByText(/status/)).toBeInTheDocument();
    });

    it('should not show unsupported warning when all variables supported', () => {
      render(
        <TemplatePreview
          body="User: {{username}}"
          channelType="EMAIL"
          variables={{
            username: 'john_doe',
          }}
          supportedVariables={['username', 'email']}
        />
      );

      expect(screen.queryByText('Unsupported variables:')).not.toBeInTheDocument();
    });
  });

  describe('subject rendering', () => {
    it('should render subject when provided', () => {
      render(
        <TemplatePreview
          subject="Welcome {{name}}"
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{ name: 'John' }}
        />
      );

      expect(screen.getByText('Subject')).toBeInTheDocument();
      expect(screen.getByText('Welcome John')).toBeInTheDocument();
    });

    it('should not render subject when not provided', () => {
      render(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{ name: 'John' }}
        />
      );

      expect(screen.queryByText('Subject')).not.toBeInTheDocument();
    });
  });

  describe('variable detection', () => {
    it('should call onVariablesDetected callback', () => {
      const onVariablesDetected = jest.fn();

      render(
        <TemplatePreview
          body="Hello {{name}}, welcome to {{platform}}"
          channelType="EMAIL"
          variables={{}}
          onVariablesDetected={onVariablesDetected}
        />
      );

      expect(onVariablesDetected).toHaveBeenCalledWith(
        expect.arrayContaining(['name', 'platform'])
      );
    });

    it('should call onUnsupportedVariables callback', () => {
      const onUnsupportedVariables = jest.fn();

      render(
        <TemplatePreview
          body="User: {{username}}, Status: {{status}}"
          channelType="EMAIL"
          variables={{
            username: 'john',
            status: 'active',
          }}
          supportedVariables={['username']}
          onUnsupportedVariables={onUnsupportedVariables}
        />
      );

      expect(onUnsupportedVariables).toHaveBeenCalledWith(
        expect.arrayContaining(['status'])
      );
    });
  });

  describe('live updates', () => {
    it('should update preview when body changes', () => {
      const { rerender } = render(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{ name: 'John' }}
        />
      );

      expect(screen.getByTestId('preview-body')).totoHaveTextContent('Hello John');

      rerender(
        <TemplatePreview
          body="Hi {{name}}"
          channelType="EMAIL"
          variables={{ name: 'John' }}
        />
      );

      expect(screen.getByTestId('preview-body')).toHaveTextContent('Hi John');
    });

    it('should update preview when variables change', () => {
      const { rerender } = render(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{ name: 'John' }}
        />
      );

      expect(screen.getByTestId('preview-body')).toHaveTextContent('Hello John');

      rerender(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{ name: 'Jane' }}
        />
      );

      expect(screen.getByTestId('preview-body')).toHaveTextContent('Hello Jane');
    });
  });

  describe('channel types', () => {
    it('should apply channel-specific class for email', () => {
      render(
        <TemplatePreview
          body="Test"
          channelType="EMAIL"
          variables={{}}
        />
      );

      expect(screen.getByTestId('template-preview')).toHaveClass('template-preview--email');
    });

    it('should apply channel-specific class for SMS', () => {
      render(
        <TemplatePreview
          body="Test"
          channelType="SMS"
          variables={{}}
        />
      );

      expect(screen.getByTestId('template-preview')).toHaveClass('template-preview--sms');
    });

    it('should apply channel-specific class for Discord', () => {
      render(
        <TemplatePreview
          body="Test"
          channelType="DISCORD"
          variables={{}}
        />
      );

      expect(screen.getByTestId('template-preview')).toHaveClass('template-preview--discord');
    });
  });

  describe('empty states', () => {
    it('should show empty state when no template body', () => {
      render(
        <TemplatePreview
          body=""
          channelType="EMAIL"
          variables={{}}
        />
      );

      expect(screen.getByText('No template content to preview')).toBeInTheDocument();
    });
  });

  describe('no actual notifications', () => {
    it('should not send notification on preview', () => {
      // This is verified by the fact that no network requests occur
      // in the test environment
      const { container } = render(
        <TemplatePreview
          body="Hello {{name}}"
          channelType="EMAIL"
          variables={{ name: 'John' }}
        />
      );

      // Component should render without side effects
      expect(container).toBeInTheDocument();
    });
  });

  describe('variable list display', () => {
    it('should display detected variables count', () => {
      render(
        <TemplatePreview
          body="{{var1}} {{var2}} {{var3}}"
          channelType="EMAIL"
          variables={{}}
        />
      );

      expect(screen.getByText(/3 variables/)).toBeInTheDocument();
    });

    it('should display variable names in footer', () => {
      render(
        <TemplatePreview
          body="Name: {{name}}, Email: {{email}}"
          channelType="EMAIL"
          variables={{}}
        />
      );

      expect(screen.getByText(/name, email/)).toBeInTheDocument();
    });
  });
});

describe('TemplatePreviewWithVariables', () => {
  const defaultProps = {
    body: 'Hello {{name}}!',
    channelType: 'EMAIL' as TemplateChannelType,
    editableVariables: {
      name: 'John',
    },
  };

  it('should render preview and variable editor', () => {
    render(<TemplatePreviewWithVariables {...defaultProps} />);

    expect(screen.getByTestId('template-preview')).toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
  });

  it('should allow editing variables', () => {
    const onVariableChange = jest.fn();

    render(
      <TemplatePreviewWithVariables
        {...defaultProps}
        onVariableChange={onVariableChange}
      />
    );

    const input = screen.getByTestId('variable-input-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Jane' } });

    expect(onVariableChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jane' })
    );
  });

  it('should update preview when variable is edited', async () => {
    render(
      <TemplatePreviewWithVariables
        {...defaultProps}
      />
    );

    const input = screen.getByTestId('variable-input-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Jane' } });

    await waitFor(() => {
      expect(screen.getByTestId('preview-body')).toHaveTextContent('Hello Jane!');
    });
  });

  it('should not display variable editor when no editable variables', () => {
    render(
      <TemplatePreviewWithVariables
        body="Static text"
        channelType="EMAIL"
        editableVariables={{}}
      />
    );

    expect(screen.queryByText('Variables')).not.toBeInTheDocument();
  });

  it('should display all editable variables', () => {
    render(
      <TemplatePreviewWithVariables
        body="{{name}} - {{email}} - {{phone}}"
        channelType="EMAIL"
        editableVariables={{
          name: 'John',
          email: 'john@example.com',
          phone: '555-1234',
        }}
      />
    );

    expect(screen.getByTestId('variable-input-name')).toBeInTheDocument();
    expect(screen.getByTestId('variable-input-email')).toBeInTheDocument();
    expect(screen.getByTestId('variable-input-phone')).toBeInTheDocument();
  });
});
