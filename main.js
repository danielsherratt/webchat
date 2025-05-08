// File: cesw_hub/main.js

// …existing auth & messaging code stays the same…

// New loadFiles() & uploadFile() implementations:

async function loadFiles() {
  const res = await fetch('/api/upload', { credentials: 'include' });
  if (!res.ok) return;
  const files = await res.json();
  filesList.innerHTML = '';

  files.forEach(f => {
    const li = document.createElement('li');
    li.className = 'file-item';

    // thumbnail vs icon
    const ext = f.filename.split('.').pop().toLowerCase();
    let thumb;
    if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
      thumb = document.createElement('img');
      thumb.src = f.url;
      thumb.className = 'file-thumb';
    } else {
      thumb = document.createElement('i');
      // pick an icon by extension
      const iconMap = {
        pdf: 'fa-file-pdf',
        doc: 'fa-file-word',
        docx: 'fa-file-word',
        xls: 'fa-file-excel',
        xlsx: 'fa-file-excel',
        ppt: 'fa-file-powerpoint',
        pptx: 'fa-file-powerpoint'
      };
      const cls = iconMap[ext] || 'fa-file';
      thumb.className = `file-icon fas ${cls}`;
    }
    li.appendChild(thumb);

    // filename link
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.innerHTML = `<a href="${f.url}" target="_blank">${f.filename}</a>`;
    li.appendChild(nameSpan);

    // delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'file-delete';
    delBtn.textContent = '×';
    delBtn.onclick = async () => {
      if (!confirm(`Delete ${f.filename}?`)) return;
      const dres = await fetch(`/api/upload?key=${encodeURIComponent(f.key)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (dres.ok) loadFiles();
      else alert('Delete failed');
    };
    li.appendChild(delBtn);

    filesList.appendChild(li);
  });
}

async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return alert('No file selected');
  const form = new FormData();
  form.append('file', file);

  // upload to R2
  const res = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    body: form
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return alert('Upload failed: ' + (err.error || res.status));
  }

  // auto‐post chat link
  const { filename, url } = await res.json();
  await fetch('/api/messages', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      content: `<a href="${url}" target="_blank">${filename}</a>`,
      channel: currentChannel
    })
  });

  fileInput.value = '';
  loadFiles();
  loadMessages();
}
