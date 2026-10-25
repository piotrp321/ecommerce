import { fireEvent, render, screen } from '@testing-library/react';
import ErrorPage from './error';

describe('ErrorPage', () => {
  it('explains the problem and lets the user retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const retry = vi.fn();
    render(<ErrorPage error={new Error('boom')} retry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Coś poszło nie tak');
    expect(screen.queryByText('boom')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
