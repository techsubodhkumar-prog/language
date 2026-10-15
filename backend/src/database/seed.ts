import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export interface SeedInterest {
  id: string;
  name: string;
  category: string;
}

export const INITIAL_INTERESTS: SeedInterest[] = [
  // 1. Travel and exploration
  { id: 'travel_solo_companions', name: 'Solo travelers finding travel companions', category: 'Travel and exploration' },
  { id: 'travel_weekend_roadtrips', name: 'Weekend trips and road trips', category: 'Travel and exploration' },
  { id: 'travel_group_tours', name: 'Group tours and sightseeing', category: 'Travel and exploration' },
  { id: 'travel_backpacking_trekking', name: 'Backpacking and trekking trips', category: 'Travel and exploration' },
  { id: 'travel_bike_motorcycle', name: 'Bike trips and motorcycle rides', category: 'Travel and exploration' },
  { id: 'travel_camping_overnight', name: 'Camping and overnight stays', category: 'Travel and exploration' },
  { id: 'travel_beach_islands', name: 'Beach trips and island hopping', category: 'Travel and exploration' },
  { id: 'travel_mountain_hiking', name: 'Mountain trips and hiking', category: 'Travel and exploration' },
  { id: 'travel_wildlife_safaris', name: 'Wildlife safaris and nature trails', category: 'Travel and exploration' },
  { id: 'travel_pilgrimages', name: 'Pilgrimages and religious tours', category: 'Travel and exploration' },
  { id: 'travel_international', name: 'International travel groups', category: 'Travel and exploration' },
  { id: 'travel_budget_shared', name: 'Budget travel and shared accommodation', category: 'Travel and exploration' },

  // 2. Adventure and outdoor experiences
  { id: 'adv_trekking_hiking', name: 'Trekking and hiking', category: 'Adventure and outdoor experiences' },
  { id: 'adv_rock_climbing', name: 'Rock climbing', category: 'Adventure and outdoor experiences' },
  { id: 'adv_river_rafting', name: 'River rafting', category: 'Adventure and outdoor experiences' },
  { id: 'adv_kayaking_canoeing', name: 'Kayaking and canoeing', category: 'Adventure and outdoor experiences' },
  { id: 'adv_scuba_snorkeling', name: 'Scuba diving and snorkeling', category: 'Adventure and outdoor experiences' },
  { id: 'adv_paragliding', name: 'Paragliding groups', category: 'Adventure and outdoor experiences' },
  { id: 'adv_ziplining', name: 'Ziplining', category: 'Adventure and outdoor experiences' },
  { id: 'adv_cycling_groups', name: 'Cycling groups', category: 'Adventure and outdoor experiences' },
  { id: 'adv_fishing_trips', name: 'Fishing trips', category: 'Adventure and outdoor experiences' },
  { id: 'adv_group_picnics', name: 'Group picnics', category: 'Adventure and outdoor experiences' },
  { id: 'adv_stargazing_camping', name: 'Stargazing and night camping', category: 'Adventure and outdoor experiences' },
  { id: 'adv_nature_photography', name: 'Nature photography walks', category: 'Adventure and outdoor experiences' },

  // 3. Team sports
  { id: 'sports_football', name: 'Football', category: 'Team sports' },
  { id: 'sports_cricket', name: 'Cricket', category: 'Team sports' },
  { id: 'sports_volleyball', name: 'Volleyball', category: 'Team sports' },
  { id: 'sports_basketball', name: 'Basketball', category: 'Team sports' },
  { id: 'sports_kabaddi', name: 'Kabaddi', category: 'Team sports' },
  { id: 'sports_hockey', name: 'Hockey', category: 'Team sports' },
  { id: 'sports_baseball', name: 'Baseball', category: 'Team sports' },
  { id: 'sports_handball', name: 'Handball', category: 'Team sports' },
  { id: 'sports_badminton_doubles', name: 'Badminton doubles', category: 'Team sports' },
  { id: 'sports_table_tennis_doubles', name: 'Table tennis doubles', category: 'Team sports' },
  { id: 'sports_relay_races', name: 'Relay races', category: 'Team sports' },
  { id: 'sports_tug_of_war', name: 'Tug of war', category: 'Team sports' },

  // 4. Indoor, online and social games
  { id: 'games_multiplayer_video', name: 'Multiplayer video games', category: 'Indoor, online and social games' },
  { id: 'games_lan_gaming', name: 'LAN gaming sessions', category: 'Indoor, online and social games' },
  { id: 'games_online_squads', name: 'Online gaming squads', category: 'Indoor, online and social games' },
  { id: 'games_chess', name: 'Chess tournaments', category: 'Indoor, online and social games' },
  { id: 'games_carrom', name: 'Carrom', category: 'Indoor, online and social games' },
  { id: 'games_ludo', name: 'Ludo', category: 'Indoor, online and social games' },
  { id: 'games_poker_cards', name: 'Poker and card games', category: 'Indoor, online and social games' },
  { id: 'games_board_games', name: 'Board games', category: 'Indoor, online and social games' },
  { id: 'games_escape_rooms', name: 'Escape rooms', category: 'Indoor, online and social games' },
  { id: 'games_quiz', name: 'Quiz competitions', category: 'Indoor, online and social games' },
  { id: 'games_trivia_nights', name: 'Trivia nights', category: 'Indoor, online and social games' },
  { id: 'games_multiplayer_vr', name: 'Multiplayer VR games', category: 'Indoor, online and social games' },
  { id: 'games_esports', name: 'Esports teams and tournaments', category: 'Indoor, online and social games' },

  // 5. Fitness and wellness
  { id: 'fitness_gym_workout', name: 'Gym workout partners', category: 'Fitness and wellness' },
  { id: 'fitness_group_running', name: 'Group running', category: 'Fitness and wellness' },
  { id: 'fitness_morning_walks', name: 'Morning walks', category: 'Fitness and wellness' },
  { id: 'fitness_yoga', name: 'Yoga classes', category: 'Fitness and wellness' },
  { id: 'fitness_dance_zumba', name: 'Dance fitness and Zumba', category: 'Fitness and wellness' },
  { id: 'fitness_cycling_clubs', name: 'Cycling clubs', category: 'Fitness and wellness' },
  { id: 'fitness_martial_arts', name: 'Martial arts classes', category: 'Fitness and wellness' },
  { id: 'fitness_swimming', name: 'Swimming groups', category: 'Fitness and wellness' },
  { id: 'fitness_marathon_training', name: 'Marathon training', category: 'Fitness and wellness' },
  { id: 'fitness_challenges', name: 'Fitness challenges', category: 'Fitness and wellness' },
  { id: 'fitness_weightlifting', name: 'Weightlifting partners', category: 'Fitness and wellness' },
  { id: 'fitness_sports_coaching', name: 'Sports coaching groups', category: 'Fitness and wellness' },

  // 6. Shopping and errands
  { id: 'shop_malls', name: 'Shopping at malls', category: 'Shopping and errands' },
  { id: 'shop_clothes_fashion', name: 'Clothes and fashion shopping', category: 'Shopping and errands' },
  { id: 'shop_weddings', name: 'Shopping for weddings', category: 'Shopping and errands' },
  { id: 'shop_grocery', name: 'Grocery shopping with friends', category: 'Shopping and errands' },
  { id: 'shop_electronics', name: 'Electronics shopping', category: 'Shopping and errands' },
  { id: 'shop_furniture_decor', name: 'Furniture and home decor shopping', category: 'Shopping and errands' },
  { id: 'shop_street_markets', name: 'Street markets and flea markets', category: 'Shopping and errands' },
  { id: 'shop_thrift', name: 'Thrift shopping', category: 'Shopping and errands' },
  { id: 'shop_gifts', name: 'Gift shopping', category: 'Shopping and errands' },
  { id: 'shop_car_bike', name: 'Car or bike shopping with family', category: 'Shopping and errands' },
  { id: 'shop_college_supplies', name: 'Shopping for college supplies', category: 'Shopping and errands' },
  { id: 'shop_bargain_hunting', name: 'Bargain hunting in local markets', category: 'Shopping and errands' },

  // 7. Food and dining
  { id: 'food_restaurants', name: 'Going to restaurants', category: 'Food and dining' },
  { id: 'food_new_cafes', name: 'Trying new cafes', category: 'Food and dining' },
  { id: 'food_street_tours', name: 'Street-food tours', category: 'Food and dining' },
  { id: 'food_crawls', name: 'Food crawls', category: 'Food and dining' },
  { id: 'food_breakfast_brunch', name: 'Going for breakfast or brunch', category: 'Food and dining' },
  { id: 'food_buffet', name: 'Buffet dining', category: 'Food and dining' },
  { id: 'food_dessert', name: 'Ice cream and dessert outings', category: 'Food and dining' },
  { id: 'food_cooking_sessions', name: 'Group cooking sessions', category: 'Food and dining' },
  { id: 'food_bbq_outdoor', name: 'Barbecue and outdoor cooking', category: 'Food and dining' },
  { id: 'food_potluck', name: 'Potluck parties', category: 'Food and dining' },
  { id: 'food_festivals', name: 'Food festivals', category: 'Food and dining' },
  { id: 'food_local_cuisines', name: 'Exploring local cuisines', category: 'Food and dining' },

  // 8. Entertainment and recreation
  { id: 'ent_movies_cinema', name: 'Movies at cinemas', category: 'Entertainment and recreation' },
  { id: 'ent_concerts_live', name: 'Concerts and live music', category: 'Entertainment and recreation' },
  { id: 'ent_comedy_shows', name: 'Comedy shows', category: 'Entertainment and recreation' },
  { id: 'ent_theatre_drama', name: 'Theatre and drama', category: 'Entertainment and recreation' },
  { id: 'ent_amusement_parks', name: 'Amusement parks', category: 'Entertainment and recreation' },
  { id: 'ent_water_parks', name: 'Water parks', category: 'Entertainment and recreation' },
  { id: 'ent_bowling', name: 'Bowling alleys', category: 'Entertainment and recreation' },
  { id: 'ent_go_karting', name: 'Go-karting', category: 'Entertainment and recreation' },
  { id: 'ent_arcades', name: 'Arcades', category: 'Entertainment and recreation' },
  { id: 'ent_trampoline_parks', name: 'Trampoline parks', category: 'Entertainment and recreation' },
  { id: 'ent_paintball_laser', name: 'Paintball and laser tag', category: 'Entertainment and recreation' },
  { id: 'ent_fairs_exhibitions', name: 'Fairs and exhibitions', category: 'Entertainment and recreation' },
  { id: 'ent_museums_galleries', name: 'Museums and art galleries', category: 'Entertainment and recreation' },
  { id: 'ent_zoos_aquariums', name: 'Zoos and aquariums', category: 'Entertainment and recreation' },
  { id: 'ent_gaming_cafes', name: 'Gaming cafes', category: 'Entertainment and recreation' },

  // 9. Meeting new people
  { id: 'social_new_friends', name: 'Finding new friends', category: 'Meeting new people' },
  { id: 'social_friend_group', name: 'Making a friend group', category: 'Meeting new people' },
  { id: 'social_similar_interests', name: 'Finding people with similar interests', category: 'Meeting new people' },
  { id: 'social_new_to_city', name: 'Meeting people new to a city', category: 'Meeting new people' },
  { id: 'social_college_friends', name: 'College friendship groups', category: 'Meeting new people' },
  { id: 'social_after_moving', name: 'Making friends after moving', category: 'Meeting new people' },
  { id: 'social_language_exchange', name: 'Language exchange meetups', category: 'Meeting new people' },
  { id: 'social_hobby_meetups', name: 'Hobby-based meetups', category: 'Meeting new people' },
  { id: 'social_networking', name: 'Networking with new people', category: 'Meeting new people' },
  { id: 'social_event_partners', name: 'Finding people to attend events with', category: 'Meeting new people' },
  { id: 'social_local_communities', name: 'Joining local communities', category: 'Meeting new people' },
  { id: 'social_solo_participants', name: 'Meeting other solo participants', category: 'Meeting new people' },

  // 10. Dating and relationships
  { id: 'dating_event_date', name: 'Finding a date for an event', category: 'Dating and relationships' },
  { id: 'dating_double_dates', name: 'Double dates', category: 'Dating and relationships' },
  { id: 'dating_group_dates', name: 'Group dates', category: 'Dating and relationships' },
  { id: 'dating_speed_dating', name: 'Speed-dating events', category: 'Dating and relationships' },
  { id: 'dating_couples_outings', name: 'Couples outings', category: 'Dating and relationships' },
  { id: 'dating_couples_games', name: 'Couples game nights', category: 'Dating and relationships' },
  { id: 'dating_meet_couples', name: 'Meeting other couples', category: 'Dating and relationships' },
  { id: 'dating_singles_dinners', name: 'Group dinners for singles', category: 'Dating and relationships' },
  { id: 'dating_singles_social', name: 'Singles social activities', category: 'Dating and relationships' },
  { id: 'dating_wedding_plusones', name: 'Wedding dates or plus-ones', category: 'Dating and relationships' },
  { id: 'dating_couples_activities', name: 'Group activities for couples', category: 'Dating and relationships' },
  { id: 'dating_shared_interests', name: 'Social events for people with shared interests', category: 'Dating and relationships' },

  // 11. Parties and celebrations
  { id: 'party_birthdays', name: 'Birthday parties', category: 'Parties and celebrations' },
  { id: 'party_surprise', name: 'Surprise parties', category: 'Parties and celebrations' },
  { id: 'party_house_parties', name: 'House parties', category: 'Parties and celebrations' },
  { id: 'party_farewells', name: 'Farewell parties', category: 'Parties and celebrations' },
  { id: 'party_reunions', name: 'Reunions', category: 'Parties and celebrations' },
  { id: 'party_bachelor_bachelorette', name: 'Bachelor and bachelorette parties', category: 'Parties and celebrations' },
  { id: 'party_anniversaries', name: 'Anniversary celebrations', category: 'Parties and celebrations' },
  { id: 'party_weddings', name: 'Wedding functions', category: 'Parties and celebrations' },
  { id: 'party_graduations', name: 'Graduation celebrations', category: 'Parties and celebrations' },
  { id: 'party_festivals', name: 'Festival celebrations', category: 'Parties and celebrations' },
  { id: 'party_new_years_eve', name: 'New Years Eve gatherings', category: 'Parties and celebrations' },
  { id: 'party_baby_showers', name: 'Baby showers and family celebrations', category: 'Parties and celebrations' },

  // 12. Nightlife and evening activities
  { id: 'night_pubs_clubs', name: 'Going to pubs or clubs', category: 'Nightlife and evening activities' },
  { id: 'night_dancing_clubbing', name: 'Dancing and clubbing', category: 'Nightlife and evening activities' },
  { id: 'night_karaoke', name: 'Karaoke nights', category: 'Nightlife and evening activities' },
  { id: 'night_live_music', name: 'Live music nights', category: 'Nightlife and evening activities' },
  { id: 'night_markets', name: 'Night markets', category: 'Nightlife and evening activities' },
  { id: 'night_food_outings', name: 'Late-night food outings', category: 'Nightlife and evening activities' },
  { id: 'night_rooftop_dining', name: 'Rooftop dining', category: 'Nightlife and evening activities' },
  { id: 'night_evening_walks', name: 'Evening walks', category: 'Nightlife and evening activities' },
  { id: 'night_photography', name: 'Night photography', category: 'Nightlife and evening activities' },
  { id: 'night_cycling', name: 'Night cycling groups', category: 'Nightlife and evening activities' },
  { id: 'night_stargazing', name: 'Stargazing', category: 'Nightlife and evening activities' },
  { id: 'night_bonfires', name: 'Bonfire gatherings', category: 'Nightlife and evening activities' },
  { id: 'night_light_shows', name: 'Festival light shows', category: 'Nightlife and evening activities' },
  { id: 'night_fireworks', name: 'Fireworks events', category: 'Nightlife and evening activities' },
  { id: 'night_social_mixers', name: 'Social mixers', category: 'Nightlife and evening activities' },
  { id: 'night_board_game_cafes', name: 'Board-game cafe nights', category: 'Nightlife and evening activities' },

  // 13. Special occasions and seasonal activities
  { id: 'season_holi', name: 'Holi celebrations', category: 'Special occasions and seasonal activities' },
  { id: 'season_diwali', name: 'Diwali shopping and celebrations', category: 'Special occasions and seasonal activities' },
  { id: 'season_navratri_garba', name: 'Navratri and Garba groups', category: 'Special occasions and seasonal activities' },
  { id: 'season_durga_puja', name: 'Durga Puja visits', category: 'Special occasions and seasonal activities' },
  { id: 'season_eid', name: 'Eid gatherings', category: 'Special occasions and seasonal activities' },
  { id: 'season_christmas', name: 'Christmas outings', category: 'Special occasions and seasonal activities' },
  { id: 'season_new_year', name: 'New Year celebrations', category: 'Special occasions and seasonal activities' },
  { id: 'season_valentines', name: 'Valentine\'s Day group events', category: 'Special occasions and seasonal activities' },
  { id: 'season_wedding_shopping', name: 'Wedding-season shopping', category: 'Special occasions and seasonal activities' },
  { id: 'season_summer_vacations', name: 'Summer vacations', category: 'Special occasions and seasonal activities' },
  { id: 'season_monsoon_trips', name: 'Monsoon trips', category: 'Special occasions and seasonal activities' },
  { id: 'season_winter_camping', name: 'Winter camping', category: 'Special occasions and seasonal activities' },
  { id: 'season_seasonal_fairs', name: 'Seasonal fairs', category: 'Special occasions and seasonal activities' },
  { id: 'season_flower_festivals', name: 'Flower and garden festivals', category: 'Special occasions and seasonal activities' },
  { id: 'season_cultural_parades', name: 'Cultural parades', category: 'Special occasions and seasonal activities' },
  { id: 'season_sporting_events', name: 'Local sporting events', category: 'Special occasions and seasonal activities' },
  { id: 'season_pilgrimages', name: 'Religious pilgrimages', category: 'Special occasions and seasonal activities' },
  { id: 'season_charity_marathons', name: 'Charity marathons', category: 'Special occasions and seasonal activities' },

  // Backwards compatibility aliases for previous milestone tests
  { id: 'cricket', name: 'Cricket', category: 'Team sports' },
  { id: 'football', name: 'Football', category: 'Team sports' },
  { id: 'badminton', name: 'Badminton', category: 'Team sports' },
  { id: 'gym_fitness', name: 'Gym & Fitness', category: 'Fitness and wellness' },
  { id: 'running', name: 'Running', category: 'Fitness and wellness' },
  { id: 'tea_coffee', name: 'Tea & Coffee Meetups', category: 'Food and dining' },
  { id: 'restaurants_food', name: 'Dining & Street Food', category: 'Food and dining' },
  { id: 'travel_trips', name: 'Weekend Trips & Trekking', category: 'Travel and exploration' },
  { id: 'city_walks', name: 'City Walks & Sightseeing', category: 'Travel and exploration' },
  { id: 'board_games', name: 'Board Games', category: 'Indoor, online and social games' },
  { id: 'video_games', name: 'Multiplayer Video Games', category: 'Indoor, online and social games' },
  { id: 'movies_cinema', name: 'Movies & Cinema', category: 'Entertainment and recreation' },
];

async function runSeed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes('placeholder')) {
    console.error('ERROR: DATABASE_URL is not configured with an active PostgreSQL instance.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    console.log('Seeding initial curated interests...');
    await client.query('BEGIN');

    for (const interest of INITIAL_INTERESTS) {
      await client.query(
        `
        INSERT INTO interests (interest_id, name, category, is_active)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (interest_id)
        DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, is_active = EXCLUDED.is_active;
      `,
        [interest.id, interest.name, interest.category],
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${INITIAL_INTERESTS.length} interests successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to seed interests:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
