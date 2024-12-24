const { ActivityType, Client } = require('discord.js');
const { DisTube } = require('distube');
const fetch = require('node-fetch');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { SpotifyPlugin } = require('@distube/spotify');
const { ShardingManager } = require('discord.js');
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const { REST, ActionRowBuilder, ButtonBuilder, Discord, MessageButton, MessageActionRow, WebhookClient, GatewayIntentBits, EmbedBuilder, MessageEmbed, Message, messageLink, Embed, Events, StringSelectMenuBuilder, Role } = require('discord.js');
const token = process.env.DISCORD_TOKEN;

const randomNum = Math.floor(Math.random() * 300) + 1;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  presence: {
    activities: [{
      name: `-help | Shard${randomNum}`,
      type: 0
    }],
    status: 'online'
  }
});

const clientId = '-P1Suv6iOl4QNTGfZuTS-u43R9W92gz1sWZo2FUyW88k3MlazQZefVmswdDKyKeh';
const clientSecret = 'nUUji_kPVQAuYSaP7CZ1EJEr0O1i2zT1Hwz6blTgQrTlLxa2VjjzHb7VHFK1X8DiHhPPbAFmgyuTjHQiDRruHQ';

async function getAccessToken() {
  const response = await fetch('https://api.genius.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
  });

  const data = await response.json();
  return data.access_token;
}

async function searchGenius(artist, title) {
  const accessToken = await getAccessToken();
  const apiUrl = `https://api.genius.com/search?q=${encodeURIComponent(artist)}%20${encodeURIComponent(title)}`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return data;
}

async function getLyrics(artist, title) {
  try {
    const geniusData = await searchGenius(artist, title);
    const hits = geniusData.response.hits;

    if (hits.length > 0) {
      const songId = hits[0].result.id;
      const lyricsUrl = `https://api.genius.com/songs/${songId}/lyrics`;
      const lyricsResponse = await fetch(lyricsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const lyricsData = await lyricsResponse.json();
      const lyrics = lyricsData.response.lyrics.body;

      return lyrics;
    } else {
      return null;
    }
  } catch (error) {
    throw new Error('Error fetching lyrics');
  }
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
})

client.distube = new DisTube(client, {
  plugins: [
      new SpotifyPlugin({ emitEventsAfterFetching: true }),
  ],
  leaveOnFinish: false,
  searchCooldown: 10,
  leaveOnEmpty: false,
  leaveOnStop: true,
  emitNewSongOnly: true,
  emitAddSongWhenCreatingQueue: false,
  emitAddListWhenCreatingQueue: false,
})

client.distube.setMaxListeners(3);

let isLoopEnabled = false;
let isAutoplayEnabled = false;
let playMessage;
let playSongEmbed;
const bassBoostLevel = 0;
let currentTrackPosition = 0;
let isQueueLoopEnabled = false;
let isNightcoreEnabled = false;
let pauseButtonDisabled = true;
let resumeButtonDisabled = true;

client.on('guildMemberAdd', async (member) => {
  try {
    await member.guild.fetch();

    const guild = member.guild;
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Willkommen ${member.user.username}!`)
      .setDescription(`Willkommen auf dem RyBot Service Server, ${member}! Wir freuen uns, dich hier zu haben.`)
      .setFooter({
        text: `test`
      });

    const channelId = '1141882000534413374';
    const channel = guild.channels.cache.get(channelId);

    if (channel && channel.type === 'GUILD_TEXT') {
      channel.send({ embeds: [welcomeEmbed] })
        .catch(console.error);
    }

    const roleId = '1141881999901081642';
    const role = guild.roles.cache.get(roleId);

    if (role) {
      member.roles.add(role);
    }
  } catch (error) {
    console.error('Error:', error);
  }
});


client.distube.on('addSong', (queue, song) => {
  const totalDuration = formatDuration(queue.duration);
  const currentSongDuration = formatDuration(song.duration);
  const queueEmbed = new EmbedBuilder()
    .setColor('#800080')
    .setTitle(`✅ Song added to the Queue!`)
    .setDescription(`👍 Song: [\`${song.name}\`](${song.url}) - \`${currentSongDuration}\``)
    .addFields(
      { name: `⌛ Estimated Time:`, value: `\`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\` - \`${formatDuration(queue.songs[0].duration)}\``, inline: false },
    )
    .addFields(
      { name: `🌀 Queue Duration:`, value: `\`${totalDuration}\``, inline: true },
    )
    .setFooter({
      text: `💢 Action by: ${song.user.tag}`,
      iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
    })
    .setThumbnail(song.thumbnail);
  queue.textChannel.send({ embeds: [queueEmbed] });

  async function playSong(queue, message, playSongMessage) {
    try {
      const fetchedMessage = await message.channel.messages.fetch(playSongMessage.id);
      const totalDuration = formatDuration(queue.duration);
      const song = queue.songs[0];
      const playSongEmbed = new EmbedBuilder()
      playSongEmbed.setColor('#800080')
      playSongEmbed.setDescription('NOW PLAYING: ' + song.name)
      playSongEmbed.addFields({name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true})
      playSongEmbed.addFields({name: `⏱ Duration:`,value: `>>> \`${formatDuration(song.duration)}\``, inline: true})
      playSongEmbed.addFields({name: `🌀 Queue:`,value: `>>> \`${totalDuration}\``, inline: true})
      playSongEmbed.addFields({name: `🔊 Volume:`, value: `>>> \`${queue.volume}\``, inline: true})
      playSongEmbed.addFields({name: `♾ Loop:`, value: `>>> ${isLoopEnabled ? '✅' : '❌'}`, inline: true})
      playSongEmbed.addFields({name: `↪️ Autoplay:`,value: `>>> ${isAutoplayEnabled ? '✅' : '❌'}`, inline: true})
      playSongEmbed.addFields({name: `❔ Filter:`, value: `>>> ${bassBoostLevel > 0 ? '✅' : '❌'}`, inline: true})
      playSongEmbed.addFields({name: `❔ Found Song:`,value: `>>> [\`Click here\`](${song.url})`, inline: false});
      playSongEmbed.setFooter({
        text: `💢 Action by: ${song.user.tag}`,
        iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
      });
      playSongEmbed.setThumbnail(song.thumbnail);
      const sentMessage = await fetchedMessage.edit({ embeds: [playSongEmbed] });
      playMessage = sentMessage;
    } catch (error) {
      console.error(error);
    }
  }
});

client.distube.on('addSong', (queue, song) => {
  const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
  const playSongEmbed = new EmbedBuilder()
    .setColor('#800080')
    .setAuthor({
      name: `${song.name}`,
      iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
    })
    .addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
    .addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
    .addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
    .addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
    .addFields({ name: `♾ Loop:`, value: `>>> ${queue.loopMode ? '✅' : '❌'}`, inline: true })
    .addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
    .addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
    .addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });

  playSongEmbed.setFooter({
    text: `💢 Action by: ${song.user.tag}`,
    iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
  });
  playSongEmbed.setThumbnail(song.thumbnail);

  queue.textChannel.messages.fetch(playMessage.id)
    .then(msg => {
      const embedToUpdate = msg.embeds[0];
      embedToUpdate.fields.find(field => field.name === '♾ Loop:').value = `>>> ${queue.loopMode ? '✅' : '❌'}`;
      embedToUpdate.fields.find(field => field.name === '↪️ Autoplay:').value = `>>> ${queue.autoplay ? '✅' : '❌'}`;
      embedToUpdate.fields.find(field => field.name === '🌀 Queue:').value = `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``;
      msg.edit({ embeds: [embedToUpdate] })
        .catch(error => {
          console.error(error);
        });
    })
    .catch(error => {
      console.error(error);
    });
});









function loadPrefix() {
  try {
    const data = fs.readFileSync('prefix.json');
    return JSON.parse(data).prefix;
  } catch (error) {
    console.error('Fehler beim Laden des Präfixes:', error);
    return '-';
  }
}


function savePrefix(prefix) {
  const data = JSON.stringify({ prefix });
  fs.writeFileSync('prefix.json', data);
}

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

 
  let prefix = loadPrefix();

  
  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  if (!message.content.toLocaleLowerCase().startsWith(prefix)) return;
  const command = args.shift().toLowerCase();
  if (command === 'play') {
    const queue = client.distube.getQueue(message);
    const playSongEmbed = new EmbedBuilder()
      .setColor('#800080')
      .setDescription(`:mag_right: Searching Song...`);
    const playMessage = await message.channel.send({ embeds: [playSongEmbed] });
  
    let bassBoostLevel = 0;
    let isBassboostEnabled = false;

    currentTrackPosition = 0;
  
    if (args[0].includes('list=')) {
      const playlistURL = args[0];
      const playlistID = playlistURL.split('list=')[1];
      if (playlistID && /^[a-zA-Z0-9_-]{11}$/.test(playlistID)) {
        client.distube.play(message.member.voice.channel, '', {
          member: message.member,
          textChannel: message.channel,
          message,
          filter: isBassboostEnabled ? `bassboost=${bassBoostLevel}` : null,
          playlist: playlistID,
        });
      }
    } else if (args[0].includes('spotify:')) {
      const spotifySong = args[0];
      client.distube.playVoiceChannel(message.member.voice.channel, spotifySong, {
        member: message.member,
        textChannel: message.channel,
        message,
        filter: isBassboostEnabled ? `bassboost=${bassBoostLevel}` : null,
        filter: isNightcoreEnabled ? `nightcore` : false,
      });
    } else if (args.length > 1 && args[0].toLowerCase() === 'bassboost') {
      const level = parseInt(args[1]);
      if (!isNaN(level) && level >= 1 && level <= 20) {
        bassBoostLevel = level;
        isBassboostEnabled = true;
      }
      args.splice(0, 2);
    }
  
    client.distube.play(message.member.voice.channel, args.join(' '), {
      member: message.member,
      textChannel: message.channel,
      message,
      filter: isBassboostEnabled ? `bassboost=${bassBoostLevel}` : null,
      filter: isNightcoreEnabled ? `nightcore` : false,
      playlist: args[0].includes('list=') ? args[0] : null
    }).then(song => {
      const fetchedMessage = message.channel.messages.cache.get(playMessage.id);
      if (fetchedMessage) {
        fetchedMessage.delete().catch(console.error);
      }
    });

    } else if (command === 'disconnect') {
        if (args.length > 0) return;
        client.distube.stop(message);
        const stopEmbed = new EmbedBuilder()
        stopEmbed.setColor('#800080');
        stopEmbed.setDescription('⏹ **Stopped playing and left the Channel!**');
        message.channel.send({ embeds: [stopEmbed] });
      } else if (command === 'join') {
        let voiceChannel = message.member.voice.channel
        if (!voiceChannel) {
          const joinEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ **You must be in a voice channel to use this command!**');
          return message.channel.send({ embeds: [joinEmbed] });
        }
      
        try {
          client.distube.voices.join(voiceChannel)
          const joinEmbed = new EmbedBuilder()
            .setColor('#800080')
            .setDescription(`✅ **Joined voice channel ${voiceChannel.name}!**`);
          message.channel.send({ embeds: [joinEmbed] });
        } catch (error) {
          console.error(error);
          const joinEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ **An error occurred while trying to join the voice channel!**');
          message.channel.send({ embeds: [joinEmbed] });
        }
        } else if (command === 'leave') {
        if (args.length > 0) return;
        client.distube.stop(message);
        const stopEmbed = new EmbedBuilder()
        stopEmbed.setColor('#800080');
        stopEmbed.setDescription('⏹ **Stopped playing and left the Channel!**');
        message.channel.send({ embeds: [stopEmbed] });
      } else if (command === 'addfilter-3d') {
        const queue = client.distube.getQueue(message.guild);
        if (!queue) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(':x: **Es wird momentan keine Musik abgespielt, daher kann ich den 3D-Filter nicht hinzufügen!**');
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
      
        const speed = 1.3;        
        const pitch = 0.7;       
        const vaporwaveFilter = {
          speed: speed,
          pitch: pitch
        };
      
        queue.filters.add('vaporwave', vaporwaveFilter);
      
        const threeDEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ Add Filter 3D`);
        const threeDMessage = await message.channel.send({ embeds: [threeDEmbed] });
      } else if (command === 'removefilter-3d') {
        const queue = client.distube.getQueue(message.guild);
        if (!queue) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(':x: **Es wird momentan keine Musik abgespielt, daher kann ich den 3D-Filter nicht entfernen!**');
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
        queue.filters.remove('vaporwave');
      
        const threeDEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ Remove Filter 3D`);
        const threeDMessage = await message.channel.send({ embeds: [threeDEmbed] });
      } else if (command === 'addfilter-echo') {
        const queue = client.distube.getQueue(message.guild);
        if (!queue) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(':x: **Es wird momentan keine Musik abgespielt, daher kann ich den Echo-Filter nicht hinzufügen!**');
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
     
        const echoFilter = {
          flanger: {
            depth: 0.7,       
            delay: 0.3,      
            regen: 0.4,     
            width: 1,        
            speed: 0.2,       
          }
        };
      
        queue.filters.add('flanger', echoFilter);
      
        const echoEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ Add Filter Echo`);
        const echoMessage = await message.channel.send({ embeds: [echoEmbed] });
      } else if (command === 'removefilter-echo') {
        const queue = client.distube.getQueue(message.guild);
        if (!queue) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(':x: **Es wird momentan keine Musik abgespielt, daher kann ich den Echo-Filter nicht entfernen!**');
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
        queue.filters.remove('flanger');
      
        const echoEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ Remove Filter Echo`);
        const echoMessage = await message.channel.send({ embeds: [echoEmbed] });   
} else if (command === 'addfilter-nightcore') {
        const queue = client.distube.getQueue(message.guild);
        if (!queue) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(':x: **Es wird momentan keine Musik abgespielt, daher kann ich den Nightcore-Filter nicht hinzufügen!**');
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
        queue.filters.add('nightcore', true);
    queue.filters.set(['nightcore']);
      
        const nightcoreEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ Add Filter Nightcore`);
        const nightcoreMessage = await message.channel.send({ embeds: [nightcoreEmbed] });
      } else if (command === 'removefilter-nightcore') {
        const queue = client.distube.getQueue(message.guild);
        if (!queue) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(':x: **Es wird momentan keine Musik abgespielt, daher kann ich den Nightcore-Filter nicht entfernen!**');
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
        queue.filters.remove('nightcore', true);
      
        const nightcoreEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ Remove Filter Nightcore`);
        const nightcoreMessage = await message.channel.send({ embeds: [nightcoreEmbed] });
      } else if (command === 'play-summer') {
  const playlistURL = 'https://youtube.com/playlist?list=PLVaxw-YvxH88otQoq49_xU3rC__5YMYyY'; 

  const queue = client.distube.getQueue(message);
  const playSongEmbed = new EmbedBuilder()
    .setColor('#800080')
    .setDescription(`:mag_right: Searching Song...`);
  const playMessage = await message.channel.send({ embeds: [playSongEmbed] });

  let bassBoostLevel = 0;
  let isBassboostEnabled = false;

  currentTrackPosition = 0;

  if (queue) {
    client.distube.stop(message);
  }

  client.distube.play(message.member.voice.channel, playlistURL, {
    member: message.member,
    textChannel: message.channel,
    message,
    filter: isBassboostEnabled ? `bassboost=${bassBoostLevel}` : null,
    playlist: playlistURL
  }).then(song => {
    const fetchedMessage = message.channel.messages.cache.get(playMessage.id);
    if (fetchedMessage) {
      fetchedMessage.delete().catch(console.error);
    }
  });

  return;
} else if (command === 'nowplaying') {
  const queue = client.distube.getQueue(message);
  const playSongEmbed = new EmbedBuilder()
    .setColor('#800080')
    .setDescription(`:mag_right: Searching Song...`);
  const playMessage = await message.channel.send({ embeds: [playSongEmbed] });

  let bassBoostLevel = 0;
  let isBassboostEnabled = false;

  currentTrackPosition = 0;

  if (queue) {
    client.distube.stop(message);
  }

  client.distube.play(message.member.voice.channel, args.join(' '), {
    member: message.member,
    textChannel: message.channel,
    message,
    filter: isBassboostEnabled ? `bassboost=${bassBoostLevel}` : null,
    filter: isNightcoreEnabled ? `nightcore` : false,
    playlist: args[0].includes('list=') ? args[0] : null
  }).then(song => {
    const fetchedMessage = message.channel.messages.cache.get(playMessage.id);
    if (fetchedMessage) {
      fetchedMessage.delete().catch(console.error);
    }
  });

  return;
 } else if (command === 'play-sad') {
  const playlistURL = 'https://www.youtube.com/watch?v=P5gO9HHU4yU&list=RDP5gO9HHU4yU'; 

  const queue = client.distube.getQueue(message);
  const playSongEmbed = new EmbedBuilder()
    .setColor('#800080')
    .setDescription(`:mag_right: Searching Song...`);
  const playMessage = await message.channel.send({ embeds: [playSongEmbed] });

  let bassBoostLevel = 0;
  let isBassboostEnabled = false;

  currentTrackPosition = 0;

  if (queue) {
    client.distube.stop(message);
  }

  client.distube.play(message.member.voice.channel, playlistURL, {
    member: message.member,
    textChannel: message.channel,
    message,
    filter: isBassboostEnabled ? `bassboost=${bassBoostLevel}` : null,
    playlist: playlistURL
  }).then(song => {
    const fetchedMessage = message.channel.messages.cache.get(playMessage.id);
    if (fetchedMessage) {
      fetchedMessage.delete().catch(console.error);
    }
  });

  return;
} else if (command === 'queue') {
  const queue = client.distube.getQueue(message);
  if (!queue) {
    const noQueueEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setDescription('There is no queue right now!');
    message.channel.send({ embeds: [noQueueEmbed] });
  } else {
    const queueEmbed = new EmbedBuilder()
      .setAuthor({
        name: 'Queue',
        iconURL: 'https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif'
      })
      .setColor('#800080')
      .setTitle('Current Queue')
      .setDescription(queue.songs
        .map((song, index) => `**${index + 1}**. ${song.name} - \`${song.formattedDuration}\``)
        .slice(0, 20)
        .join('\n'));
    message.channel.send({ embeds: [queueEmbed] });
  }
      } else if (command === 'filters') {
        const filterEmbed = new EmbedBuilder()
            .setColor('#800080')
            .setDescription('To define Multiple Filters add a SPACE ( ) in between!')
            filterEmbed.addFields({name: `All Valid Filters:`, value: `>>> \`nightcore\`, \`3d\`, \`echo\`, \`bassboost 1\`, \`bassboost 2\`, \`bassboost 3\`, \`bassboost 4\`, \`bassboost 5\`, \`bassboost 6\`, \`bassboost 7\`, \`bassboost 8\`, \`bassboost 9\`, \`bassboost 10\`, \`bassboost 11\`, \`bassboost 12\`, \`bassboost 13\`, \`bassboost 14\`, \`bassboost 15\`, \`bassboost 16\`, \`bassboost 17\`, \`bassboost 18\`, \`bassboost 19\`, \`bassboost 20\`, \`bassboost 21\`, \`bassboost 20\`, \`bassboost 22\`, \`bassboost 23\`, \`bassboost 24\`, \`bassboost 25\`, \`bassboost 26\`, \`bassboost 27\`, \`bassboost 28\`, \`bassboost 29\`, \`bassboost 30\``, inline: true});
        message.channel.send({ embeds: [filterEmbed] });  
      } else if (command === 'forward') {
        const seekTime = parseInt(message.content.split(' ')[1]); 
        currentTrackPosition += seekTime;
        client.distube.seek(message, currentTrackPosition);
        const seekEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`⏩ **Skipped forward by ${seekTime} seconds!**`);
        message.channel.send({ embeds: [seekEmbed] });
      } else if (command === 'rewind') {
        const seekTime = parseInt(message.content.split(' ')[1]);
        currentTrackPosition += seekTime;
        client.distube.seek(message, currentTrackPosition);
          const rewindEmbed = new EmbedBuilder();
          rewindEmbed.setColor('#800080');
          rewindEmbed.setDescription(`⏪ **Rewound back by ${seekTime} seconds!**`);
          message.channel.send({ embeds: [rewindEmbed] });
        } else if (command === 'skipto') {
          const index = parseInt(message.content.split(' ')[1]) - 1; 
          if (index < 0 || index >= client.distube.getQueue(message).songs.length) {
          
            message.channel.send(':x: The entered number is invalid');
            return;
          }
          client.distube.jump(message, index);
          const skiptoEmbed = new EmbedBuilder();
          skiptoEmbed.setColor('#800080');
          skiptoEmbed.setDescription(`⏭️ **Skipped to song number ${index + 1}!**`);
          message.channel.send({ embeds: [skiptoEmbed] });
      } else if (command === 'ping') {
        if (args.length > 0) return;
        const pingEmbed = new EmbedBuilder()
        pingEmbed.setColor('#800080');
        pingEmbed.setDescription(`👍 Bot Ping: \`${client.ws.ping}ms\``);
        message.channel.send({ embeds: [pingEmbed] });
      } else if (command === 'replay') {
        const queue = client.distube.getQueue(message);
        if (!queue || !queue.songs.length) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`❌ There is no song playing currently to replay!`);
          return message.channel.send({ embeds: [errorEmbed] });
        }
        const seekTime = parseInt(message.content.split(' ')[1]); 
        currentTrackPosition += 0;
        client.distube.seek(message, currentTrackPosition);
        const replayEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`🔄 **Replayed the current track**`);
        message.channel.send({ embeds: [replayEmbed] });
      } else if (command === 'invite') {
        const inviteEmbed = new EmbedBuilder()
        inviteEmbed.setColor('#800080');
        inviteEmbed.setTitle(`Invite Me!`)
        inviteEmbed.setDescription(`[\`Click here\`](https://discord.com/api/oauth2/authorize?client_id=1063525973766717540&permissions=8&scope=bot) to invite me!`);
        inviteEmbed.setFooter({
          text: `💢 Action by: ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ format: 'png', dynamic: true })
        });
        message.channel.send({ embeds: [inviteEmbed] });
      } else if (command === 'clear') {
        const queue = client.distube.getQueue(message);
        if (!queue || !queue.songs.length) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`❌ The queue is already empty!`);
          return message.channel.send({ embeds: [errorEmbed] });
        }
        client.distube.stop(message);
        const clearQueueEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`✅ Cleared the queue!`);
        message.channel.send({ embeds: [clearQueueEmbed] });
      } else if (command === 'shuffle') {
        const queue = client.distube.getQueue(message);
        if (!queue) {
      
          return message.channel.send("There is no active queue.");
        }
        queue.shuffle(); 
        const shuffleEmbed = new EmbedBuilder(); 
        shuffleEmbed.setColor('#800080');
        shuffleEmbed.setDescription("The playlist has been shuffled successfully.");
        message.channel.send({ embeds: [shuffleEmbed] });
      } else if (command === 'leave-server') {
         
  const developerRoleId = '1119763779329216553';
  const member = message.guild.members.cache.get(message.author.id);
  if (!member.roles.cache.has(developerRoleId)) {
   
    const noPermissionEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setDescription('❌ **You do not have permission to use this command!**');
    return message.channel.send({ embeds: [noPermissionEmbed] });
  }


  const serverId = args[0];
  if (!serverId) {
    const missingServerIdEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setDescription('❌ **Please provide a server ID!**');
    return message.channel.send({ embeds: [missingServerIdEmbed] });
  }

  
  const guild = client.guilds.cache.get(serverId);
  if (!guild) {
    const invalidServerIdEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setDescription('❌ **Invalid server ID!**');
    return message.channel.send({ embeds: [invalidServerIdEmbed] });
  }

  try {
    await guild.leave();
    const leaveEmbed = new EmbedBuilder()
      .setColor('#800080')
      .setDescription(`✅ **Successfully left server ${guild.name} (${guild.id})!**`);
    message.channel.send({ embeds: [leaveEmbed] });
  } catch (error) {
    console.error(error);
    const leaveErrorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setDescription('❌ **An error occurred while trying to leave the server!**');
    message.channel.send({ embeds: [leaveErrorEmbed] });
  }
      } else if (command === 'remove') {
        const queue = client.distube.getQueue(message);
        if (!queue || !queue.songs.length) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`❌ The queue is currently empty!`);
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
        const index = parseInt(args[0]);
        if (isNaN(index) || index < 1 || index > queue.songs.length) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`❌ Invalid song number! Please provide a valid number from 1 to ${queue.songs.length}.`);
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
        const removedSong = queue.songs.splice(index - 1, 1)[0];
        const removeEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`🗑️ Removed song ${index}: ${removedSong.name}`);
        message.channel.send({ embeds: [removeEmbed] });
      } else if (command === 'join-server') {
   
        const developerRoleId = '1119763779329216553';
        const member = message.guild.members.cache.get(message.author.id);
        if (!member.roles.cache.has(developerRoleId)) {
         
          const noPermissionEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ **You do not have permission to use this command!**');
          return message.channel.send({ embeds: [noPermissionEmbed] });
        }
      
       
        const serverId = args[0];
        if (!serverId) {
          const missingServerIdEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ **Please provide a server ID!**');
          return message.channel.send({ embeds: [missingServerIdEmbed] });
        }
      
       
        try {
          const guild = await client.guilds.fetch(serverId);
          await guild.addMember(client.user.id);
          const joinEmbed = new EmbedBuilder()
            .setColor('#800080')
            .setDescription(`✅ **Successfully joined server ${guild.name} (${guild.id})!**`);
          message.channel.send({ embeds: [joinEmbed] });
        } catch (error) {
          console.error(error);
          const joinErrorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ **An error occurred while trying to join the server!**');
          message.channel.send({ embeds: [joinErrorEmbed] });
        }      
        } else if (command === 'uptime') {
  if (args.length > 0) return;
  const uptime = process.uptime();
  const uptimeEmbed = new EmbedBuilder()
  uptimeEmbed.setColor('#800080');
  uptimeEmbed.setDescription(`🕐 Uptime: \`${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s\``);
  message.channel.send({ embeds: [uptimeEmbed] });
      } else if (command === 'pause') {
        const queue = client.distube.getQueue(message);
        if (!queue) {
          const noQueueEmbed = new EmbedBuilder()
            .setColor('#800080')
            .setDescription('❌ **There is no queue**');
          return message.channel.send({ embeds: [noQueueEmbed] });
        }
        client.distube.pause(message);
        const pauseEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription('Music paused.');
        message.channel.send({ embeds: [pauseEmbed] });
      } else if (command === 'resume') {
        const queue = client.distube.getQueue(message);
        if (!queue) {
          const noQueueEmbed = new EmbedBuilder()
            .setColor('#800080')
            .setDescription('❌ **There is no queue**');
          return message.channel.send({ embeds: [noQueueEmbed] });
        }
        client.distube.resume(message);
        const resumeEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription('Music resumed.');
        message.channel.send({ embeds: [resumeEmbed] });
      } else if (command === 'removefilter-bassboost') {
        const queue = client.distube.getQueue(message.guild);
        const isNightcoreEnabled = queue.filters.has('nightcore');
      
        const filterResolvable = { name: "bassboost", value: `bass=g=${bassBoostLevel}` };
        queue.filters.add(filterResolvable, false);
        queue.filters.set([filterResolvable]);
      
        if (isNightcoreEnabled) {
          queue.filters.add('nightcore', true);
          queue.filters.set(['nightcore']);
        }
      
        const bassEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ **Remove Filter Bassboost**`);
        const bassMessage = await message.channel.send({ embeds: [bassEmbed] });
        try {
          const fetchedMessage = await message.channel.messages.fetch(playMessage.id);
          const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
          const song = queue.songs[0];
          const playSongEmbed = new EmbedBuilder()
          playSongEmbed.setColor('#800080')
          playSongEmbed.setAuthor({
            name: `${song.name}`,
            iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
          })
          playSongEmbed.addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
          playSongEmbed.addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
          playSongEmbed.addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
          playSongEmbed.addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
          playSongEmbed.addFields({ name: `♾ Loop:`, value: `>>> ${queue.repeatMode === 2 ? '✅' : '❌'}`, inline: true })
          playSongEmbed.addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
          playSongEmbed.addFields({ name: `❔ Filter:`, value: `>>> ❌`, inline: true })
          playSongEmbed.addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
          playSongEmbed.setFooter({
            text: `💢 Action by: ${song.user.tag}`,
            iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
          });
          playSongEmbed.setThumbnail(song.thumbnail);
          fetchedMessage.edit({ embeds: [playSongEmbed] })
            .then(sentMessage => {
              playMessage = sentMessage;
            })
            .catch(error => console.log(error));
        } catch (error) {
          console.log(error)
          const errembed = new EmbedBuilder()
            .setColor('#ff0000');
          errembed.setDescription(`:x: **Die PlayNachricht konnte nicht bearbeitet werden!**`);
          message.channel.send({ embeds: [errembed] });
        }            
      } else if (command === 'addfilter-bassboost') {
        const queue = client.distube.getQueue(message.guild);
        if (!queue) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription('❌ **There is no music playing at the moment, so I cannot add bass boost**');
          return message.channel.send({ embeds: [errorEmbed] });
        }
        if (args.length < 1 || isNaN(args[0])) {
          const errorEmbed = new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription("❌ **Please provide a valid number for the bass boost level**");
          return message.channel.send({ embeds: [errorEmbed] });
        }
        const bassBoostLevel = parseInt(args[0]);
        if (bassBoostLevel < 0 || bassBoostLevel > 30) {
          const errorEmbed = new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription("❌ **The bass boost level must be between 0 and 30**");
          return message.channel.send({ embeds: [errorEmbed] });
        }
      
        const isNightcoreEnabled = queue.filters.has('nightcore');
      
        const filterResolvable = { name: "bassboost", value: `bass=g=${bassBoostLevel}` };
        queue.filters.add(filterResolvable, true);
        queue.filters.set([filterResolvable]);
      
        if (isNightcoreEnabled) {
          queue.filters.add('nightcore', true);
          queue.filters.set(['nightcore']);
        }
      
        const bassEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setDescription(`♨️ **Bass boost level set to** ${bassBoostLevel}`);
        const bassMessage = await message.channel.send({ embeds: [bassEmbed] });
        bassMessage.delete({ timeout: 3000 });
        setTimeout(() => message.delete(), 100);
      
        try {
          const fetchedMessage = await message.channel.messages.fetch(playMessage.id);
          const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
          const song = queue.songs[0];
          const playSongEmbed = new EmbedBuilder()
          playSongEmbed.setColor('#800080')
          playSongEmbed.setAuthor({
            name: `${song.name}`,
            iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
          })
          playSongEmbed.addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
          playSongEmbed.addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
          playSongEmbed.addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
          playSongEmbed.addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
          playSongEmbed.addFields({ name: `♾ Loop:`, value: `>>> ${queue.repeatMode === 2 ? '✅' : '❌'}`, inline: true })
          playSongEmbed.addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
          playSongEmbed.addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.has('bassboost') ? '✅' : '❌'}`, inline: true })
          playSongEmbed.addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
          playSongEmbed.setFooter({
            text: `💢 Action by: ${song.user.tag}`,
            iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
          });
          playSongEmbed.setThumbnail(song.thumbnail);
          fetchedMessage.edit({ embeds: [playSongEmbed] })
            .then(sentMessage => {
              playMessage = sentMessage;
            })
            .catch(error => console.log(error));
        } catch (error) {
          console.log(error)
          const errembed = new EmbedBuilder()
            .setColor('#ff0000');
          errembed.setDescription(`:x: **Die PlayNachricht konnte nicht bearbeitet werden!**`);
          message.channel.send({ embeds: [errembed] });
        }      
      } else if (command === 'help') {
        if (args.length > 0) return;
        const user = client.user;
        const helpEmbed = new EmbedBuilder()
        helpEmbed.setAuthor({
          name: `${message.author.tag}`,
          iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
        })
        helpEmbed.setColor('#FF8C00');
        helpEmbed.setDescription('**🔰 HELP MENU** \n\nRamio is a high-quality music bot with many features!\n\n**FILTER [1]**\n> `addfilter`, `removefilter`, `filters`\n**INFO [2]**\n> `botinfo`, `support`, `uptime`, `ping`\n**MUSIC [2]**\n> `play`, `play-summer`, `play-sad`, `join`, `disconnect`, `leave`, `skip`, `skipto`, `autoplay`, `pause`, `resume`\n**QUEUE [3]**\n> `queue`, `remove`, `clear`, `loop`, `shuffle`, `volume`\n**SETTINGS [4]**\n> `soon...`\n**SONG [5]**\n>  `forward`,  `nowplaying`,  `rewind`, `replay`');
        helpEmbed.setFooter({
          text: `💢 Action by: ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ format: 'png', dynamic: true })
        });
        helpEmbed.setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true })); 
        message.channel.send({ embeds: [helpEmbed] });
      } else if (command === 'botinfo') {
        if (args.length > 0) return;
        const { version: djsVersion } = require('discord.js');
        const os = require('os');
        const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        const totalMemory = os.totalmem() / 1024 / 1024;
        const uptime = process.uptime();
        const cpuModel = os.cpus()[0].model;
        const si = require('systeminformation');
        const cpuData = await si.currentLoad();
        const cpuUsage = cpuData.currentload;
        const connectionCount = client.voice && client.voice.connections ? client.voice.connections.size : 0;
        const serverCount = client.guilds.cache.size;
        const userCount = client.users.cache.size;
      
        const botInfoEmbed = new EmbedBuilder()
      .setColor('#800080')
      .setTitle('Bot Info')
      .addFields(
        {
          name: 'Stats',
          value: `⌚️ Uptime\n${uptime.toFixed(2)} Secs\n⏳ Memory Usage\n${usedMemory.toFixed(2)} / ${totalMemory.toFixed(2)} MB`,
        },
        {
          name: '📁 Users',
          value: `Total: ${userCount} Users`,
          inline: true,
        },
        {
          name: '📁 Servers',
          value: `Total: ${serverCount} Servers`,
          inline: true,
        },
        {
          name: '📁 Voice-Channels',
          value: `${connectionCount}`,
          inline: true,
        },
        {
          name: '👾 Discord.js',
          value: `v${djsVersion}`,
          inline: true,
        },
        {
          name: '🤖 Node',
          value: `v${process.version}`,
          inline: true,
        },
        {
          name: '🤖 CPU',
          value: `${cpuModel}`,
          inline: true,
        },
        {
          name: '🤖 CPU usage',
          value: `${cpuUsage ? cpuUsage.toFixed(2) : 'N/A'}%`, 
          inline: true,
        },
        {
          name: '💻 Platform',
          value: `${os.platform()}`,
          inline: true,
        },
        {
          name: 'API Latency',
          value: `${client.ws.ping}ms`,
          inline: true,
        }
      );
    message.channel.send({ embeds: [botInfoEmbed] });
  } else if (command === 'skip') {
    const queue = client.distube.getQueue(message); 
    if (queue && queue.songs.length > 1) { 
      client.distube.skip(message);
      const skipEmbed = new EmbedBuilder();
      skipEmbed.setColor('#800080');
      skipEmbed.setDescription(':thumbsup: **Skipped current song**');
      message.channel.send({ embeds: [skipEmbed] });
    } else {
      const errorEmbed = new EmbedBuilder();
      errorEmbed.setColor('#FF0000');
      errorEmbed.setDescription(':x: There are no songs left in the queue to skip!');
      message.channel.send({ embeds: [errorEmbed]});
    }  
      } else if (command === 'loop') {
        isLoopEnabled = !isLoopEnabled;
        client.distube.setRepeatMode(message, isLoopEnabled ? 2 : 0);
        const loopEmbed = new EmbedBuilder()
        loopEmbed.setColor('#800080');
        loopEmbed.setDescription(`**Loop mode has been** ${isLoopEnabled ? 'enabled' : 'disabled'}.`);
        message.channel.send({ embeds: [loopEmbed] });
        try {
          const queue = client.distube.getQueue(message);
          const fetchedMessage = await message.channel.messages.fetch(playMessage.id);
          const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
          const song = queue.songs[0]; 
          const playSongEmbed = new EmbedBuilder()
          playSongEmbed.setColor('#800080')
          playSongEmbed.setAuthor({
            name: `${song.name}`,
            iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
          })
          playSongEmbed.addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
          playSongEmbed.addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
          playSongEmbed.addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
          playSongEmbed.addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
          playSongEmbed.addFields({ name: `♾ Loop:`, value: `>>> ${queue.repeatMode === 2 ? '✅' : '❌'}`, inline: true }) // Verwende repeatMode, um den Loop-Modus zu überprüfen
          playSongEmbed.addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
          playSongEmbed.addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
          playSongEmbed.addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
          playSongEmbed.setFooter({
            text: `💢 Action by: ${song.user.tag}`,
            iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
          });  
          playSongEmbed.setThumbnail(song.thumbnail);
          fetchedMessage.edit({ embeds: [playSongEmbed] });
        } catch (error) {
          console.log(error);
          const errembed = new EmbedBuilder()
          errembed.setColor('#ff0000');
          errembed.setDescription(`:x: Die PlayNachricht konnte nicht bearbeitet werden!`);
          message.channel.send({ embeds: [errembed] });
        }      
  } else if (command === 'volume') {
    const queue = client.distube.getQueue(message);
    const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
    const newVolume = parseInt(args[0]);
    if (isNaN(newVolume)) return;
    if (newVolume > 9999999999999999999999999999999999) {
        const volumeLimitEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription(':x: **Volume limit exceeded!** The maximum volume is 150%.');
        return message.channel.send({ embeds: [volumeLimitEmbed] });
    }
    client.distube.setVolume(message, newVolume);
    const volumeEmbed = new EmbedBuilder()
        .setColor('#800080')
        .setDescription(`🔊 **Changed the Volume to** ${newVolume}%`);
    const volumeMessage = await message.channel.send({ embeds: [volumeEmbed] });
    volumeMessage.delete({ timeout: 3000 });
    setTimeout(() => message.delete(), 100);
    try {
        const fetchedMessage = await message.channel.messages.fetch(playMessage.id);
        const song = queue.songs[0];
        const playSongEmbed = new EmbedBuilder()
        playSongEmbed.setColor('#800080')
                playSongEmbed.setAuthor({
                  name: `${song.name}`,
                  iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
                })
                playSongEmbed.addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
                playSongEmbed.addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
                playSongEmbed.addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
                playSongEmbed.addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
                playSongEmbed.addFields({ name: `♾ Loop:`, value: `>>> ${queue.loopMode ? '✅' : '❌'}`, inline: true })
                playSongEmbed.addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
                playSongEmbed.addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
                playSongEmbed.addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
        playSongEmbed.setFooter({
          text: `💢 Action by: ${song.user.tag}`,
          iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
        });  
        playSongEmbed.setThumbnail(song.thumbnail); 
        fetchedMessage.edit({ embeds: [playSongEmbed] })
        .then(sentMessage => {
            playMessage = sentMessage;
        })
        .catch(error => console.log(error));
    } catch (error) {
        console.log(error)
        const errembed = new EmbedBuilder()
        errembed.setColor('#ff0000');
        errembed.setDescription(`:x: **Die PlayNachricht konnte nicht bearbeitet werden!**`);
        message.channel.send({ embeds: [errembed] });
    }
        } else if (command === 'autoplay') {
            const queue = client.distube.getQueue(message);
            const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
            const isAutoplayEnabled = queue.toggleAutoplay();
            const autoplayEmbed = new EmbedBuilder()
            autoplayEmbed.setColor('#800080');
            autoplayEmbed.setDescription(`**Autoplay** ${isAutoplayEnabled ? 'enabled' : 'disabled'}.`);
            message.channel.send({ embeds: [autoplayEmbed] });
            try {
                const fetchedMessage = await message.channel.messages.fetch(playMessage.id);
                const playSongEmbed = new EmbedBuilder()
                const song = queue.songs[0];
                playSongEmbed.setColor('#800080')
                playSongEmbed.setAuthor({
                  name: `${song.name}`,
                  iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
                })
                playSongEmbed.addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
                playSongEmbed.addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
                playSongEmbed.addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
                playSongEmbed.addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
                playSongEmbed.addFields({ name: `♾ Loop:`, value: `>>> ${queue.loopMode ? '✅' : '❌'}`, inline: true })
                playSongEmbed.addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
                playSongEmbed.addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
                playSongEmbed.addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
                playSongEmbed.setFooter({
                  text: `💢 Action by: ${song.user.tag}`,
                  iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
                });  
                playSongEmbed.setThumbnail(song.thumbnail); 
                fetchedMessage.edit({ embeds: [playSongEmbed] });
            } catch (error) {
                console.log(error)
                const errembed = new EmbedBuilder()
                errembed.setColor('#ff0000');
                errembed.setDescription(`:x: **Die PlayNachricht konnte nicht bearbeitet werden!**`);
                message.channel.send({ embeds: [errembed] });
            }
        }
        
});

client.distube.on('playSong', (queue, song) => {
  const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
  const playSongEmbed = new EmbedBuilder() 
      .setColor('#800080')
      .setAuthor({
        name: `${song.name}`,
        iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
      })
      .addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
      .addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
      playSongEmbed.addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
      .addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
      .addFields({ name: `♾ Loop:`, value: `>>> ${queue.loopMode ? '✅' : '❌'}`, inline: true })
      .addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
      .addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
      .addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });

    playSongEmbed.setFooter({
      text: `💢 Action by: ${song.user.tag}`,
      iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
    });
    playSongEmbed.setThumbnail(song.thumbnail);

    queue.textChannel.send({ embeds: [playSongEmbed] })
      .then(msg => {
        playMessage = msg;
      

const skipButton = new ButtonBuilder()
      .setCustomId('skip')
      .setLabel('Skip')
      .setStyle('Primary')
      .setEmoji('⏭️')
      .setDisabled(false);


const stopButton = new ButtonBuilder()
  .setCustomId('stop')
  .setLabel('Stop')
  .setStyle('Danger')
  .setEmoji('🏠')
  .setDisabled(false);

const pauseButton = new ButtonBuilder()
  .setCustomId('pause')
  .setLabel('Pause')
  .setStyle('Secondary')
  .setEmoji('⏸️')
  .setDisabled(false);

const autoplayButton = new ButtonBuilder()
  .setCustomId('autoplay')
  .setLabel('Autoplay')
  .setStyle('Success')
  .setEmoji('🔁')
  .setDisabled(false);

const shuffleButton = new ButtonBuilder()
  .setCustomId('shuffle')
  .setLabel('Shuffle')
  .setStyle('Primary')
  .setEmoji('🔀')
  .setDisabled(false);

  const songButton = new ButtonBuilder()
  .setCustomId('song')
  .setLabel('Song')
  .setStyle('Success')
  .setEmoji('🔁')
  .setDisabled(false);

  const queueButton = new ButtonBuilder()
  .setCustomId('queue')
  .setLabel('Queue')
  .setStyle('Success')
  .setEmoji('🔂')
  .setDisabled(false);

  const Sec10pButton = new ButtonBuilder()
  .setCustomId('+10Sec')
  .setLabel('+10 Sec')
  .setStyle('Primary')
  .setEmoji('⏩')
  .setDisabled(false);

  const Sec10mButton = new ButtonBuilder()
  .setCustomId('-10Sec')
  .setLabel('-10 Sec')
  .setStyle('Primary')
  .setEmoji('⏪')
  .setDisabled(false);

  const lyricsButton = new ButtonBuilder()
  .setCustomId('lyrics')
  .setLabel('Lyrics')
  .setStyle('Primary')
  .setEmoji('📝')
  .setDisabled(false);

  const resumeButton = new ButtonBuilder()
    .setCustomId('resume')
    .setLabel('Resume')
    .setStyle('Primary')
    .setEmoji('▶️')
    .setDisabled(false);

    const actionRow1 = new ActionRowBuilder()
      .addComponents(skipButton, stopButton, resumeButton, pauseButton, autoplayButton);

    const actionRow2 = new ActionRowBuilder()
      .addComponents(shuffleButton, songButton, queueButton, Sec10pButton, Sec10mButton);

    const actionRow3 = new ActionRowBuilder()
      .addComponents(lyricsButton);

    msg.channel.send({ components: [actionRow1, actionRow2, actionRow3] });
  })
  .catch(console.error);
});

client.on('interactionCreate', async interaction => {
if (!interaction.isButton()) return;

const queue = client.distube.getQueue(interaction.guildId);
if (!queue) return;

 if (interaction.customId === 'skip') {
  if (queue.songs.length > 1) {
    queue.skip();
    const skipEmbed = new EmbedBuilder();
    skipEmbed.setColor('#800080');
    skipEmbed.setDescription(':thumbsup: **Skipped current song**');
    interaction.reply({ embeds: [skipEmbed] });
  } else {
    const errorEmbed = new EmbedBuilder();
    errorEmbed.setColor('#FF0000');
    errorEmbed.setDescription(':x: There are no songs left in the queue to skip!');
    interaction.reply({ embeds: [errorEmbed]});
  }
  } else if (interaction.customId === 'stop') {
    queue.stop();
    const stopEmbed = new EmbedBuilder();
    stopEmbed.setColor('#800080');
    stopEmbed.setDescription('⏹ **Stopped playing and left the Channel!**');
    interaction.reply({ embeds: [stopEmbed] });
  } else if (interaction.customId === 'pause') {
    try {
      queue.pause();
      const pauseEmbed = new EmbedBuilder();
      pauseEmbed.setColor('#800080');
      pauseEmbed.setDescription('⏸️ **Paused Music!**');
      interaction.reply({ embeds: [pauseEmbed] });
    } catch (error) {
      const errorEmbed = new EmbedBuilder();
      errorEmbed.setColor('#FF0000');
      errorEmbed.setDescription(`⛔ Unable to pause music: ${error.message}`);
      interaction.reply({ embeds: [errorEmbed] });
    }
  } else if (interaction.customId === 'resume') {
    try {
      queue.resume();
      const resumeEmbed = new EmbedBuilder();
      resumeEmbed.setColor('#800080');
      resumeEmbed.setDescription('▶️ **Resumed Music!**');
      interaction.reply({ embeds: [resumeEmbed] });
    } catch (error) {
      const errorEmbed = new EmbedBuilder();
      errorEmbed.setColor('#FF0000');
      errorEmbed.setDescription(`⛔ Unable to resume music: ${error.message}`);
      interaction.reply({ embeds: [errorEmbed] });
    }
} else if (interaction.customId === 'autoplay') {
  const isAutoplayEnabled = queue.toggleAutoplay(); 
  const autoplayEmbed = new EmbedBuilder(); 
  autoplayEmbed.setColor('#800080');
  autoplayEmbed.setDescription(`**Autoplay** ${isAutoplayEnabled ? 'enabled' : 'disabled'}.`);
  interaction.reply({ embeds: [autoplayEmbed] });
  try {
    const queue = client.distube.getQueue(interaction.channel);
    const fetchedMessage = await interaction.channel.messages.fetch(playMessage.id);
    const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
    const song = queue.songs[0]; 
    const playSongEmbed = new EmbedBuilder()
      .setColor('#800080')
      .setAuthor({
        name: `${song.name}`,
        iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
      })
      .addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
      .addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
      .addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
      .addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
      .addFields({ name: `♾ Loop:`, value: `>>> ${queue.repeatMode === 2 ? '✅' : '❌'}`, inline: true }) // Verwende repeatMode, um den Loop-Modus zu überprüfen
      .addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
      .addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
      .addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
    playSongEmbed.setFooter({
      text: `💢 Action by: ${song.user.tag}`,
      iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
    });  
    playSongEmbed.setThumbnail(song.thumbnail);
    fetchedMessage.edit({ embeds: [playSongEmbed] });
  } catch (error) {
    console.log(error);
    const errembed = new EmbedBuilder()
      .setColor('#ff0000')
      .setDescription(`:x: The play message could not be edited!`);
    interaction.reply({ embeds: [errembed] });
  }
} else if (interaction.customId === 'shuffle') {
  const queue = client.distube.getQueue(interaction.guildId);
  if (!queue) {

    return interaction.reply("There is no active queue.");
  }
  queue.shuffle(); 
  const shuffleEmbed = new EmbedBuilder(); 
  shuffleEmbed.setColor('#800080');
  shuffleEmbed.setDescription("The playlist has been shuffled successfully.");
  interaction.reply({ embeds: [shuffleEmbed] });
} else if (interaction.customId === 'song') {
  isLoopEnabled = !isLoopEnabled;
  client.distube.setRepeatMode(interaction.channel, isLoopEnabled ? 2 : 0);
  const loopEmbed = new EmbedBuilder()
    .setColor('#800080')
    .setDescription(`**Loop mode has been** ${isLoopEnabled ? 'enabled' : 'disabled'}.`);
  interaction.reply({ embeds: [loopEmbed] });
  try {
    const queue = client.distube.getQueue(interaction.channel);
    const fetchedMessage = await interaction.channel.messages.fetch(playMessage.id);
    const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
    const song = queue.songs[0]; 
    const playSongEmbed = new EmbedBuilder()
      .setColor('#800080')
      .setAuthor({
        name: `${song.name}`,
        iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
      })
      .addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
      .addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
      .addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
      .addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
      .addFields({ name: `♾ Loop:`, value: `>>> ${queue.repeatMode === 2 ? '✅' : '❌'}`, inline: true }) 
      .addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
      .addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
      .addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
    playSongEmbed.setFooter({
      text: `💢 Action by: ${song.user.tag}`,
      iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
    });  
    playSongEmbed.setThumbnail(song.thumbnail);
    fetchedMessage.edit({ embeds: [playSongEmbed] });
  } catch (error) {
    console.log(error);
    const errembed = new EmbedBuilder()
      .setColor('#ff0000')
      .setDescription(`:x: The play message could not be edited!`);
    interaction.reply({ embeds: [errembed] });
  }
} else if (interaction.customId === 'queue') {
  isQueueLoopEnabled = !isQueueLoopEnabled;
  client.distube.setRepeatMode(interaction.message, isQueueLoopEnabled ? 2 : 0);
  const loopEmbed = new EmbedBuilder()
    .setColor('#800080')
    .setDescription(`**Queue loop has been** ${isQueueLoopEnabled ? 'enabled' : 'disabled'}.`);
  interaction.reply({ embeds: [loopEmbed] });
        } else if (interaction.customId === '+10Sec') {
          currentTrackPosition += 10;
  client.distube.seek(interaction.message, currentTrackPosition);
          const secpEmbed = new EmbedBuilder()
            .setColor('#800080')
            .setDescription(`⏩ **Skipped forward by 10 seconds!**`);
          interaction.reply({ embeds: [secpEmbed] });
          try {
            const queue = client.distube.getQueue(interaction.channel);
            const fetchedMessage = await interaction.channel.messages.fetch(playMessage.id);
            const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
            const song = queue.songs[0]; 
            const playSongEmbed = new EmbedBuilder()
              .setColor('#800080')
              .setAuthor({
                name: `${song.name}`,
                iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
              })
              .addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
              .addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
              .addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
              .addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
              .addFields({ name: `♾ Loop:`, value: `>>> ${queue.repeatMode === 2 ? '✅' : '❌'}`, inline: true }) 
              .addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
              .addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
              .addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
            playSongEmbed.setFooter({
              text: `💢 Action by: ${song.user.tag}`,
              iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
            });  
            playSongEmbed.setThumbnail(song.thumbnail);
            fetchedMessage.edit({ embeds: [playSongEmbed] });
          } catch (error) {
            console.log(error);
            const errembed = new EmbedBuilder()
              .setColor('#ff0000')
              .setDescription(`:x: The play message could not be edited!`);
            interaction.reply({ embeds: [errembed] });
          }
        } else if (interaction.customId === '-10Sec') {
          currentTrackPosition -= 10;
          client.distube.seek(interaction.message, currentTrackPosition);
            const rewindEmbed = new EmbedBuilder();
            rewindEmbed.setColor('#800080');
            rewindEmbed.setDescription(`⏪ **Rewound back by 10 seconds!**`);
            interaction.reply({ embeds: [rewindEmbed] });
            try {
              const queue = client.distube.getQueue(interaction.channel);
              const fetchedMessage = await interaction.channel.messages.fetch(playMessage.id);
              const totalDuration = queue.songs.reduce((acc, song) => acc + song.duration, 0);
              const song = queue.songs[0]; 
              const playSongEmbed = new EmbedBuilder()
                .setColor('#800080')
                .setAuthor({
                  name: `${song.name}`,
                  iconURL: `https://cdn.discordapp.com/attachments/1074766735951007775/1083507133573779526/1050686602172710952.gif`
                })
                .addFields({ name: `💡 Requested by:`, value: `>>> ${song.user}`, inline: true })
                .addFields({ name: `⏱ Duration:`, value: `>>> \`${formatDuration(song.duration)}\``, inline: true, id: 'durationField' })
                .addFields({ name: `🌀 Queue:`, value: `>>> \`${queue.songs.length} Song${queue.songs.length === 1 ? '' : '(s)'}\n${formatDuration(totalDuration)}\``, inline: true })
                .addFields({ name: `🔊 Volume:`, value: `>>> \`${queue.volume} %\``, inline: true })
                .addFields({ name: `♾ Loop:`, value: `>>> ${queue.repeatMode === 2 ? '✅' : '❌'}`, inline: true }) 
                .addFields({ name: `↪️ Autoplay:`, value: `>>> ${queue.autoplay ? '✅' : '❌'}`, inline: true })
                .addFields({ name: `❔ Filter:`, value: `>>> ${queue.filters.bassboost ? '✅' : '❌'}`, inline: true })
                .addFields({ name: `❔ Found Song:`, value: `>>> [\`Click here\`](${song.url})`, inline: false });
              playSongEmbed.setFooter({
                text: `💢 Action by: ${song.user.tag}`,
                iconURL: song.user.displayAvatarURL({ format: 'png', dynamic: true })
              });  
              playSongEmbed.setThumbnail(song.thumbnail);
              fetchedMessage.edit({ embeds: [playSongEmbed] });
            } catch (error) {
              console.log(error);
              const errembed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`:x: The play message could not be edited!`);
              interaction.reply({ embeds: [errembed] });
            }
          } else if (interaction.customId === 'lyrics') {
            const song = client.distube.getQueue(interaction.message).songs[0];
            const artist = song.artistName || song.artist || '';
            const title = song.title || song.name || '';
            
            try {
              const lyrics = await getLyrics(artist, title);
            
              if (lyrics) {
                const lyricsEmbed = new EmbedBuilder()
                  .setColor('#800080')
                  .setTitle(`Lyrics - ${artist} - ${title}`)
                  .setDescription(lyrics);
                interaction.reply({ embeds: [lyricsEmbed] });
              } else {
                const noLyricsEmbed = new EmbedBuilder()
                  .setColor('#FF0000')
                  .setDescription(`Lyrics for ${artist} - ${title} not found.`);
                interaction.reply({ embeds: [noLyricsEmbed] });
              }
            } catch (error) {
              console.error('Error fetching lyrics:', error);
              const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('Error fetching lyrics. Please try again later.');
              interaction.reply({ embeds: [errorEmbed] });
            }}
})

function formatDuration(duration) {
  const hours = Math.floor(duration / 3600);
  const remainingSeconds = duration % 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  let formattedDuration = '';
  if (hours > 0) {
    formattedDuration += `${hours.toString().padStart(2, '0')}:`;
  }
  formattedDuration += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return formattedDuration;
}



client.login(token);
