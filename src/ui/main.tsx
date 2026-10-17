import { render } from 'preact';
import { strings } from './strings';

function Placeholder() {
  return (
    <main>
      <h1>{strings.placeholderHeading}</h1>
      <p>{strings.placeholderBody}</p>
    </main>
  );
}

const root = document.getElementById('app');
if (root) {
  document.title = strings.siteTitle;
  render(<Placeholder />, root);
}
