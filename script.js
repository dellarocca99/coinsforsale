const PHONE = "5492235831244";

fetch("items.json")
  .then(res => res.json())
  .then(items => {
    window.items = items;
    render(items);
  });

function render(items) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  items.forEach((item, index) => {
    let current = 0;

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="carousel">
        <button class="nav left" onclick="prev(${index})">‹</button>
        <img id="img-${index}" src="${item.images[0]}" onclick="goToItem(${item.id})"/>
        <button class="nav right" onclick="next(${index})">›</button>
      </div>

      <h3>${item.title}</h3>
      <p>${item.country} • ${item.year}</p>
      <p class="condition">${item.condition}</p>
      <p class="price">${item.price}</p>
    `;

    card.dataset.index = index;
    grid.appendChild(card);
  });
}

function prev(i) {
  const item = window.items[i];
  item._index = (item._index || 0) - 1;
  if (item._index < 0) item._index = item.images.length - 1;

  updateImage(i);
}

function next(i) {
  const item = window.items[i];
  item._index = (item._index || 0) + 1;
  if (item._index >= item.images.length) item._index = 0;

  updateImage(i);
}

function updateImage(i) {
  const item = window.items[i];
  const img = document.getElementById(`img-${i}`);
  img.src = item.images[item._index || 0];
}

function goToItem(id) {
  window.location.href = `item.html?id=${id}`;
}