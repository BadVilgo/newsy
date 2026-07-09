const topicInput = document.getElementById('topic');
const goButton = document.getElementById('go');
const statusEl = document.getElementById('status');
const bulletsEl = document.getElementById('bullets');

async function runSearch() {
  const topic = topicInput.value.trim();
  if (!topic) return;

  goButton.disabled = true;
  statusEl.textContent = 'Ładowanie... (Flash zbiera newsy, potem wybiera najważniejsze - może chwilę potrwać)';
  bulletsEl.innerHTML = '';

  try {
    const res = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Wystąpił błąd.';
      return;
    }

    statusEl.textContent = '';

    for (const bullet of data.bullets) {
      const li = document.createElement('li');
      li.textContent = bullet.text;

      if (bullet.sources.length > 0) {
        const sourcesList = document.createElement('ul');
        sourcesList.className = 'bullet-sources';
        for (const source of bullet.sources) {
          const sourceLi = document.createElement('li');
          const a = document.createElement('a');
          a.href = source.url;
          a.target = '_blank';
          a.textContent = source.title;
          sourceLi.appendChild(a);
          sourcesList.appendChild(sourceLi);
        }
        li.appendChild(sourcesList);
      }

      bulletsEl.appendChild(li);
    }
  } catch (err) {
    statusEl.textContent = 'Błąd sieci: ' + err.message;
  } finally {
    goButton.disabled = false;
  }
}

goButton.addEventListener('click', runSearch);
topicInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});
