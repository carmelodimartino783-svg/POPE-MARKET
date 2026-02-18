const STORAGE_KEYS = {
  users: 'pope_market_users',
  products: 'pope_market_products',
  orders: 'pope_market_orders',
  currentUser: 'pope_market_current_user'
};

const state = {
  users: load(STORAGE_KEYS.users, []),
  products: load(STORAGE_KEYS.products, []),
  orders: load(STORAGE_KEYS.orders, []),
  currentUser: load(STORAGE_KEYS.currentUser, null)
};

const authSection = document.querySelector('#authSection');
const dashboardSection = document.querySelector('#dashboardSection');
const producerPanel = document.querySelector('#producerPanel');
const dashboardTitle = document.querySelector('#dashboardTitle');
const productList = document.querySelector('#productList');
const orderList = document.querySelector('#orderList');
const userChip = document.querySelector('#userChip');
const toast = document.querySelector('#toast');

document.querySelector('#registerForm').addEventListener('submit', handleRegister);
document.querySelector('#loginForm').addEventListener('submit', handleLogin);
document.querySelector('#productForm').addEventListener('submit', handleCreateProduct);
document.querySelector('#logoutBtn').addEventListener('click', handleLogout);

seedDemoData();
render();

function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  if (state.users.some((user) => user.email === data.email)) {
    notify('Email già registrata.');
    return;
  }

  const user = {
    id: crypto.randomUUID(),
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    password: data.password,
    role: data.role,
    createdAt: new Date().toISOString()
  };

  state.users.push(user);
  persist();
  form.reset();
  notify('Registrazione completata. Ora puoi fare login.');
}

function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  const user = state.users.find(
    (candidate) =>
      candidate.email === data.email.trim().toLowerCase() && candidate.password === data.password
  );

  if (!user) {
    notify('Credenziali non valide.');
    return;
  }

  state.currentUser = user;
  persist();
  form.reset();
  render();
  notify(`Benvenuto ${user.name}.`);
}

function handleLogout() {
  state.currentUser = null;
  persist();
  render();
}

function handleCreateProduct(event) {
  event.preventDefault();

  if (!state.currentUser || state.currentUser.role !== 'producer') {
    notify('Solo i produttori possono pubblicare prodotti.');
    return;
  }

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  const product = {
    id: crypto.randomUUID(),
    producerId: state.currentUser.id,
    producerName: state.currentUser.name,
    name: data.name.trim(),
    quantity: Number(data.quantity),
    price: Number(data.price),
    available: Number(data.quantity),
    harvestDate: data.harvestDate,
    photo: data.photo,
    traceability: {
      company: data.company.trim(),
      area: data.area.trim(),
      treatments: data.treatments.trim(),
      residueAnalysis: data.residueAnalysis.trim()
    },
    createdAt: new Date().toISOString()
  };

  state.products.unshift(product);
  persist();
  form.reset();
  render();
  notify('Prodotto pubblicato correttamente.');
}

function reserveProduct(productId, collars) {
  if (!state.currentUser || state.currentUser.role !== 'wholesaler') {
    notify('Solo i grossisti possono prenotare.');
    return;
  }

  const product = state.products.find((item) => item.id === productId);

  if (!product) {
    notify('Prodotto non trovato.');
    return;
  }

  const qty = Number(collars);
  if (qty < 1 || Number.isNaN(qty)) {
    notify('Inserisci una quantità valida.');
    return;
  }

  if (qty > product.available) {
    notify(`Disponibilità insufficiente: restano ${product.available} colli.`);
    return;
  }

  product.available -= qty;

  const order = {
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    producerName: product.producerName,
    wholesalerId: state.currentUser.id,
    wholesalerName: state.currentUser.name,
    quantity: qty,
    lockedDailyPrice: product.price,
    status: 'prenotato',
    createdAt: new Date().toISOString()
  };

  state.orders.unshift(order);
  persist();
  render();
  notify('Prenotazione registrata con prezzo bloccato.');
}

function updateOrderStatus(orderId, nextStatus) {
  const order = state.orders.find((item) => item.id === orderId);

  if (!order) {
    notify('Ordine non trovato.');
    return;
  }

  order.status = nextStatus;
  persist();
  render();
}

function render() {
  const current = state.currentUser;

  if (!current) {
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    userChip.classList.add('hidden');
    return;
  }

  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  userChip.classList.remove('hidden');
  userChip.textContent = `${current.name} · ${roleLabel(current.role)}`;
  dashboardTitle.textContent = `Pannello ${roleLabel(current.role)}`;

  producerPanel.classList.toggle('hidden', current.role !== 'producer');

  renderProducts();
  renderOrders();
}

function renderProducts() {
  productList.innerHTML = '';

  if (state.products.length === 0) {
    productList.innerHTML = '<p class="muted">Nessun prodotto pubblicato oggi.</p>';
    return;
  }

  const template = document.querySelector('#productTemplate');

  state.products.forEach((product) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const metas = node.querySelectorAll('.meta');

    node.querySelector('.product-photo').src = product.photo;
    node.querySelector('.product-photo').alt = `Foto ${product.name}`;
    node.querySelector('.product-name').textContent = product.name;
    node.querySelector('.price-badge').textContent = `€ ${product.price.toFixed(2)} / collo`;

    metas[0].textContent = `Disponibilità: ${product.available}/${product.quantity} colli · Raccolta ${fmtDate(product.harvestDate)}`;
    metas[1].textContent = `Produttore: ${product.producerName}`;
    metas[2].textContent = `Tracciabilità → Azienda: ${product.traceability.company}`;
    metas[3].textContent = `Zona di produzione: ${product.traceability.area}`;
    metas[4].textContent = `Trattamenti: ${product.traceability.treatments}`;
    metas[5].textContent = `Analisi residui: ${product.traceability.residueAnalysis}`;

    const actions = node.querySelector('.actions');

    if (state.currentUser.role === 'wholesaler') {
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.min = '1';
      qtyInput.max = String(product.available);
      qtyInput.value = '1';
      qtyInput.style.maxWidth = '90px';
      qtyInput.disabled = product.available <= 0;

      const reserveBtn = document.createElement('button');
      reserveBtn.textContent = product.available > 0 ? 'Prenota colli' : 'Esaurito';
      reserveBtn.disabled = product.available <= 0;
      reserveBtn.addEventListener('click', () => reserveProduct(product.id, qtyInput.value));

      actions.append(qtyInput, reserveBtn);
    }

    if (state.currentUser.role === 'producer' && state.currentUser.id === product.producerId) {
      const info = document.createElement('span');
      info.className = 'muted';
      info.textContent = 'Pubblicazione tua';
      actions.append(info);
    }

    productList.append(node);
  });
}

function renderOrders() {
  orderList.innerHTML = '';

  const current = state.currentUser;
  const filtered = state.orders.filter((order) => {
    if (current.role === 'wholesaler') {
      return order.wholesalerId === current.id;
    }

    const product = state.products.find((item) => item.id === order.productId);
    return product?.producerId === current.id;
  });

  if (filtered.length === 0) {
    orderList.innerHTML = '<p class="muted">Nessun ordine nello storico.</p>';
    return;
  }

  const template = document.querySelector('#orderTemplate');

  filtered.forEach((order) => {
    const node = template.content.firstElementChild.cloneNode(true);

    node.querySelector('.order-title').textContent = `${order.productName} · ${order.quantity} colli`;
    node.querySelector('.order-meta').textContent = `Prezzo bloccato: € ${order.lockedDailyPrice.toFixed(2)} · Creato il ${fmtDate(order.createdAt)} · Grossista: ${order.wholesalerName}`;

    const badge = node.querySelector('.status-badge');
    badge.textContent = order.status;
    badge.classList.add(`status-${order.status}`);

    if (state.currentUser.role === 'producer') {
      const statuses = ['prenotato', 'spedito', 'consegnato'];
      const currentIndex = statuses.indexOf(order.status);
      if (currentIndex < statuses.length - 1) {
        const btn = document.createElement('button');
        btn.textContent = `Segna ${statuses[currentIndex + 1]}`;
        btn.addEventListener('click', () => updateOrderStatus(order.id, statuses[currentIndex + 1]));
        node.append(btn);
      }
    }

    orderList.append(node);
  });
}

function seedDemoData() {
  if (state.users.length > 0 || state.products.length > 0) {
    return;
  }

  const producer = {
    id: crypto.randomUUID(),
    name: 'Azienda Agricola Popé',
    email: 'produttore@pope.it',
    password: 'password123',
    role: 'producer',
    createdAt: new Date().toISOString()
  };

  const wholesaler = {
    id: crypto.randomUUID(),
    name: 'Grossisti Centro Italia',
    email: 'grossista@pope.it',
    password: 'password123',
    role: 'wholesaler',
    createdAt: new Date().toISOString()
  };

  const demoProducts = [
    {
      id: crypto.randomUUID(),
      producerId: producer.id,
      producerName: producer.name,
      name: 'Peperoni rossi',
      quantity: 120,
      available: 120,
      price: 18.5,
      harvestDate: new Date().toISOString().slice(0, 10),
      photo: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=800&q=60',
      traceability: {
        company: 'Azienda Agricola Popé',
        area: 'Piana del Sele',
        treatments: 'Difesa integrata',
        residueAnalysis: 'Conforme ai limiti UE, report AR-1456'
      },
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      producerId: producer.id,
      producerName: producer.name,
      name: 'Pomodori datterino',
      quantity: 90,
      available: 90,
      price: 22,
      harvestDate: new Date().toISOString().slice(0, 10),
      photo: 'https://images.unsplash.com/photo-1546470427-e5ac89cd0b8b?auto=format&fit=crop&w=800&q=60',
      traceability: {
        company: 'Azienda Agricola Popé',
        area: 'Agro Nocerino-Sarnese',
        treatments: 'Controllo biologico dei parassiti',
        residueAnalysis: 'Report LAB-882, nessun residuo critico'
      },
      createdAt: new Date().toISOString()
    }
  ];

  state.users.push(producer, wholesaler);
  state.products.push(...demoProducts);
  persist();
}

function roleLabel(role) {
  return role === 'producer' ? 'Produttore' : 'Grossista';
}

function fmtDate(input) {
  return new Date(input).toLocaleDateString('it-IT');
}

function load(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function persist() {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(state.users));
  localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(state.products));
  localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(state.orders));
  localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(state.currentUser));
}

function notify(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toast.classList.add('hidden'), 2400);
}
