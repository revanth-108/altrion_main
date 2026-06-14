export interface HostedPaymentSession {
  form_action: string;
  method: 'POST';
  fields: Record<string, string>;
}

export function submitHostedPaymentSession(session: HostedPaymentSession) {
  const form = document.createElement('form');
  form.method = session.method;
  form.action = session.form_action;
  form.style.display = 'none';

  Object.entries(session.fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
