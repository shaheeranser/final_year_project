import type { Response } from 'express';

interface Client {
  id: string;
  res: Response;
}

// Map quizId (resourceLinkId) to a list of connected teacher clients
const rooms: Record<string, Client[]> = {};

export function addClient(quizId: string, res: Response): string {
  const clientId = Date.now().toString() + Math.random().toString();
  
  if (!rooms[quizId]) {
    rooms[quizId] = [];
  }
  
  rooms[quizId].push({ id: clientId, res });
  return clientId;
}

export function removeClient(quizId: string, clientId: string): void {
  if (rooms[quizId]) {
    rooms[quizId] = rooms[quizId].filter(client => client.id !== clientId);
    if (rooms[quizId].length === 0) {
      delete rooms[quizId];
    }
  }
}

export function broadcastToQuiz(quizId: string, eventName: string, payload: any): void {
  if (!rooms[quizId]) return;

  const dataString = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  
  rooms[quizId].forEach(client => {
    try {
      client.res.write(dataString);
    } catch (err) {
      console.error(`Failed to send SSE to client ${client.id} in quiz ${quizId}`, err);
    }
  });
}
