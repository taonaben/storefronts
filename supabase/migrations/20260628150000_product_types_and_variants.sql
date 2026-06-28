-- Product type presets, flexible attributes, and generic purchasable variants.

alter table public.products
  add column if not exists product_type text not null default 'general',
  add column if not exists attributes jsonb not null default '[]'::jsonb;

alter table public.products
  drop constraint if exists products_product_type_check;

alter table public.products
  add constraint products_product_type_check check (
    product_type in (
      'general',
      'clothes',
      'shoes',
      'bedding',
      'house_decor',
      'books',
      'cutlery',
      'beauty',
      'jewelry',
      'bags',
      'car_accessories',
      'gadgets'
    )
  );

alter table public.products
  drop constraint if exists products_attributes_array_check;

alter table public.products
  add constraint products_attributes_array_check check (jsonb_typeof(attributes) = 'array');

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_options_product_name_key unique (product_id, name)
);

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.product_options(id) on delete cascade,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_option_values_option_value_key unique (option_id, value)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  selected_options jsonb not null default '{}'::jsonb,
  stock integer not null default 0,
  price_override numeric,
  sku text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_selected_options_object_check check (jsonb_typeof(selected_options) = 'object')
);

create index if not exists product_options_product_id_idx on public.product_options(product_id, sort_order);
create index if not exists product_option_values_option_id_idx on public.product_option_values(option_id, sort_order);
create index if not exists product_variants_product_id_idx on public.product_variants(product_id, sort_order);
create unique index if not exists product_variants_product_options_key on public.product_variants(product_id, md5(selected_options::text));

alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_variants enable row level security;

drop policy if exists "Public read product options for active stores" on public.product_options;
drop policy if exists "Owners manage product options" on public.product_options;
drop policy if exists "Public read product option values for active stores" on public.product_option_values;
drop policy if exists "Owners manage product option values" on public.product_option_values;
drop policy if exists "Public read product variants for active stores" on public.product_variants;
drop policy if exists "Owners manage product variants" on public.product_variants;

create policy "Public read product options for active stores" on public.product_options
  for select using (exists (
    select 1
    from public.products
    join public.stores on stores.id = products.store_id
    where products.id = product_options.product_id
      and stores.active = true
  ));

create policy "Owners manage product options" on public.product_options
  for all using (exists (
    select 1
    from public.products
    where products.id = product_options.product_id
      and public.is_store_owner(products.store_id)
  ))
  with check (exists (
    select 1
    from public.products
    where products.id = product_options.product_id
      and public.is_store_owner(products.store_id)
  ));

create policy "Public read product option values for active stores" on public.product_option_values
  for select using (exists (
    select 1
    from public.product_options
    join public.products on products.id = product_options.product_id
    join public.stores on stores.id = products.store_id
    where product_options.id = product_option_values.option_id
      and stores.active = true
  ));

create policy "Owners manage product option values" on public.product_option_values
  for all using (exists (
    select 1
    from public.product_options
    join public.products on products.id = product_options.product_id
    where product_options.id = product_option_values.option_id
      and public.is_store_owner(products.store_id)
  ))
  with check (exists (
    select 1
    from public.product_options
    join public.products on products.id = product_options.product_id
    where product_options.id = product_option_values.option_id
      and public.is_store_owner(products.store_id)
  ));

create policy "Public read product variants for active stores" on public.product_variants
  for select using (exists (
    select 1
    from public.products
    join public.stores on stores.id = products.store_id
    where products.id = product_variants.product_id
      and stores.active = true
  ));

create policy "Owners manage product variants" on public.product_variants
  for all using (exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and public.is_store_owner(products.store_id)
  ))
  with check (exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and public.is_store_owner(products.store_id)
  ));

drop trigger if exists update_product_variants_updated_at on public.product_variants;
create trigger update_product_variants_updated_at
before update on public.product_variants
for each row execute function public.update_updated_at_column();

update public.products
set product_type = 'shoes'
where product_type = 'general'
  and exists (
    select 1
    from public.product_sizes
    where product_sizes.product_id = products.id
  );

insert into public.product_options (product_id, name, sort_order)
select distinct product_id, 'Size', 0
from public.product_sizes
on conflict (product_id, name) do nothing;

insert into public.product_option_values (option_id, value, sort_order)
select product_options.id, product_sizes.label, min(product_sizes.sort_order)
from public.product_sizes
join public.product_options
  on product_options.product_id = product_sizes.product_id
 and product_options.name = 'Size'
group by product_options.id, product_sizes.label
on conflict (option_id, value) do nothing;

insert into public.product_variants (product_id, selected_options, stock, sort_order)
select
  product_sizes.product_id,
  jsonb_build_object('Size', product_sizes.label),
  product_sizes.stock,
  product_sizes.sort_order
from public.product_sizes
where not exists (
  select 1
  from public.product_variants
  where product_variants.product_id = product_sizes.product_id
    and product_variants.selected_options = jsonb_build_object('Size', product_sizes.label)
);
