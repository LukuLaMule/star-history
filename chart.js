// Mode strict
'use strict';

// Imports
import express, { json } from 'express';
import helmet from 'helmet';
import { registerFont, createCanvas } from 'canvas';
import Chart from 'chart.js/auto';
import axios from 'axios';
import dayjs from 'dayjs';
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm.js';

registerFont('./fonts/JetBrainsMono-Regular.ttf', { family: 'JetBrains Mono Regular' });
registerFont('./fonts/JetBrainsMono-Bold.ttf', { family: 'JetBrains Mono Bold' });

// Démarrer express avec une mesure de sécurité
const app = express().disable('x-powered-by');
app.use(json());
app.use(helmet());

// URL du serveur que nous créons
const API_URL = `http://localhost:${process.env.PORT || 3000}`;

// Largeur du canvas en pixels
const WIDTH = 495;

// Hauteur du canvas en pixels
const HEIGHT = 195;

// Palette de couleurs
const colorPalette = {
  red: {
    line: 'rgba(201, 25, 0, 1)',
    area: 'rgba(201, 25, 0, 0.25)',
    title: 'rgba(201, 25, 0, 0.80)',
    xlabel: 'rgba(201, 25, 0, 0.80)',
  },
  orange: {
    line: 'rgba(255, 137, 0, 1)',
    area: 'rgba(255, 137, 0, 0.25)',
    title: 'rgba(255, 137, 0, 0.80)',
    xlabel: 'rgba(255, 137, 0, 0.80)',
  },
  yellow: {
    line: 'rgba(255, 215, 0, 1)',
    area: 'rgba(255, 215, 0, 0.25)',
    title: 'rgba(255, 215, 0, 0.80)',
    xlabel: 'rgba(255, 215, 0, 0.80)',
  },
  green: {
    line: 'rgba(32, 212, 32, 1)',
    area: 'rgba(32, 212, 32, 0.25)',
    title: 'rgba(32, 212, 32, 0.80)',
    xlabel: 'rgba(32, 212, 32, 0.80)',
  },
  blue: {
    line: 'rgba(30, 78, 255, 1)',
    area: 'rgba(30, 78, 255, 0.25)',
    title: 'rgba(30, 78, 255, 0.80)',
    xlabel: 'rgba(30, 78, 255, 0.80)',
  },
  violet: {
    line: 'rgba(150, 0, 215, 1)',
    area: 'rgba(150, 0, 215, 0.25)',
    title: 'rgba(150, 0, 215, 0.80)',
    xlabel: 'rgba(150, 0, 215, 0.80)',
  },
};

// Définir l'appel GET à /chart
app.get('/chart', async (req, res) => {
  // Logging
  console.log('GET ' + req.hostname + req.url);

  // Obtenir les paramètres de l'URL
  const { username, repository, color } = req.query;

  if (!username || !repository) {
    return res.status(400).send('Username and repository are required');
  }

  // Encodage du chemin du projet pour l'API GitLab
  const projectPath = `${username}/${repository}`;
  const encodedProjectPath = encodeURIComponent(projectPath);

  // URL de l'API GitLab
  const GITLAB_API_URL = `https://gitlab.com/api/v4/projects/${encodedProjectPath}`;

  try {
    const chartImage = await createChartImage(GITLAB_API_URL, color);
    res.header({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(Buffer.from(chartImage.split(',')[1], 'base64'));
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating chart image');
  }
});

// Fonction principale pour créer le graphique avec Chart.js
const createChartImage = async (GITLAB_API_URL, color = 'violet') => {
  // Obtenir les informations du projet
  const repoInfoResponse = await axios.get(GITLAB_API_URL);
  const repoInfo = repoInfoResponse.data;

  // Vérifier si le projet existe
  if (!repoInfo) {
    throw new Error('Unable to fetch repository information.');
  }

  // Obtenir l'historique des commits
  const commits = await getCommitsHistory(GITLAB_API_URL);

  // Map pour stocker les dates et le nombre de commits
  const dateMap = new Map();

  // Compter le nombre de commits par date
  commits.forEach((commit) => {
    const date = dayjs(commit.committed_date).format('YYYY-MM-DD');
    if (dateMap.has(date)) {
      dateMap.set(date, dateMap.get(date) + 1);
    } else {
      dateMap.set(date, 1);
    }
  });

  // Créer des tableaux pour les labels (dates) et les données (commits cumulés)
  const labels = [];
  const cumulativeCommits = [];
  let totalCommits = 0;

  // Trier les dates
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) => dayjs(a).diff(dayjs(b)));

  sortedDates.forEach((date) => {
    labels.push(date);
    totalCommits += dateMap.get(date);
    cumulativeCommits.push(totalCommits);
  });

  // S'assurer que les labels couvrent la période depuis la création du projet
  if (dayjs(repoInfo.created_at).isBefore(dayjs(labels[0]), 'day')) {
    let date = dayjs(repoInfo.created_at);
    const endDate = dayjs(labels[0]);
    while (date.isBefore(endDate, 'day')) {
      labels.unshift(date.format('YYYY-MM-DD'));
      cumulativeCommits.unshift(0);
      date = date.add(1, 'day');
    }
  }

  // Si le dernier commit n'est pas d'aujourd'hui, ajouter la date d'aujourd'hui
  if (dayjs(labels[labels.length - 1]).isBefore(dayjs(), 'day')) {
    labels.push(dayjs().format('YYYY-MM-DD'));
    cumulativeCommits.push(totalCommits);
  }

  // Plugin pour arrondir les coins du canvas
  const colorArea = {
    id: 'colorArea',
    beforeDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, WIDTH, HEIGHT, 15);
      ctx.fillStyle = 'black';
      ctx.fill();
    },
  };

  // Configuration du graphique
  const configuration = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          data: cumulativeCommits,
          fill: true,
          borderColor: colorPalette[color].line,
          backgroundColor: colorPalette[color].area,
          tension: 0.4,
          borderWidth: 4,
          pointRadius: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: 'Commit History - ' + repoInfo.path_with_namespace,
          color: colorPalette[color].title,
          font: {
            family: 'JetBrains Mono Bold',
            size: 16,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
          },
          position: 'bottom',
          grid: {
            display: false,
          },
          ticks: {
            autoSkip: true,
            color: colorPalette[color].xlabel,
            font: {
              family: 'JetBrains Mono Bold',
              size: 12,
            },
          },
        },
        y: {
          min: 0,
          grid: {
            display: false,
          },
          ticks: {
            beginAtZero: true,
            color: 'rgba(255, 255, 255, 0.95)',
            font: {
              family: 'JetBrains Mono Regular',
              size: 12,
            },
          },
        },
      },
      layout: {
        padding: {
          left: 10,
          bottom: 2,
          right: 4,
        },
      },
    },
    plugins: [colorArea],
  };

  // Création du canvas
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Dessiner le graphique
  new Chart(ctx, configuration);

  // Convertir le canvas en data URL
  const dataUrl = canvas.toDataURL();
  return dataUrl;
};

// Fonction pour obtenir l'historique des commits
const getCommitsHistory = async (GITLAB_API_URL) => {
  const commits = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await axios.get(`${GITLAB_API_URL}/repository/commits`, {
      params: {
        per_page: perPage,
        page: page,
      },
    });
    const data = response.data;
    commits.push(...data);
    if (data.length < perPage) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

  // Les dates de commit sont dans data[i].committed_date
  return commits.map((commit) => ({
    committed_date: commit.committed_date,
  }));
};

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running at ${API_URL}/chart`);
});
