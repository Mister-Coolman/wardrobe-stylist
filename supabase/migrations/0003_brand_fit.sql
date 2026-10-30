-- what the owner knows about a piece: its brand, and how it fits
alter table garments add column brand text;
alter table garments add column fit text check (fit in ('slim', 'classic', 'relaxed', 'oversized'));
