import { Controller, Get, NotFoundException } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AthleteService } from "./athlete.service.js";

@Controller("athlete")
export class AthleteController {
  constructor(private readonly athleteService: AthleteService) {}

  /**
   * Contesto completo usato dalla generazione del piano e dal coach.
   * 404 quando manca la baseline: un dossier vuoto sarebbe peggio di nessun
   * dossier, perché nasconderebbe la causa.
   */
  @Get("dossier")
  async getDossier(@CurrentUser() user: { id: string }) {
    const dossier = await this.athleteService.getDossier(user.id);
    if (!dossier) {
      throw new NotFoundException(
        "Nessuna baseline attiva: completa l'onboarding prima di leggere il dossier.",
      );
    }
    return dossier;
  }
}
