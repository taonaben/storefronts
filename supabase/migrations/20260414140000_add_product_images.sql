-- Product images table (extra images beyond the main product image_url)
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Index for fast lookups by product
create index product_images_product_id_idx on public.product_images(product_id);

-- RLS
alter table public.product_images enable row level security;

-- Everyone can read
create policy "Public read product_images" on public.product_images
  for select using (true);

-- Only admins can manage
create policy "Admins manage product_images" on public.product_images
  for all using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );
