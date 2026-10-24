# Specyfikacja biznesowa: Składanie zamówienia przez klienta (MVP)

## Kontekst specyfikacji
Dokument jest wynikiem analizy biznesowej pierwszego przypadku użycia. Nie zawiera architektury ani kodu.
Zaakceptowany przez PO jako podstawa projektu. Realizacja etapami wg roadmapy.
Uzupełnienie z roadmapy: M4 obejmuje zabezpieczenie przed powtórnym wykonaniem żądania złożenia zamówienia (idempotency key). Szczegóły reguł zostaną ustalone przy planowaniu M4.

## 1. Zakres

### W zakresie MVP
- Złożenie zamówienia z koszyka przez zalogowanego, zarejestrowanego klienta.
- Walidacja koszyka: niepusty, produkty aktywne, dostępne w magazynie, minimalna wartość.
- Atomowa rezerwacja magazynowa wszystkich pozycji.
- Wyliczenie i zapis snapshotu cen (netto, VAT, brutto) dla pozycji i dostawy.
- Adres dostawy i metoda dostawy o stałym koszcie.
- Oczekiwanie na płatność: limit czasu, limit prób, anulowanie i zwolnienie rezerwacji.
- Waluta: wyłącznie PLN.

### Poza zakresem MVP
- Zakupy bez rejestracji (gość).
- Wielowalutowość, kursy walut, VAT przy sprzedaży zagranicznej (OSS).
- Klienci B2B i prezentacja cen netto.
- Koszt dostawy zależny od wagi lub progu darmowej dostawy.
- Rabaty, kupony, promocje.

## 2. Słownik
| Pojęcie | Znaczenie |
|---|---|
| Klient | Zalogowany, zarejestrowany użytkownik. Każde zamówienie należy do dokładnie jednego klienta. |
| Koszyk | Lista produktów i ilości przygotowana przez klienta. Nie gwarantuje ceny ani dostępności. |
| Pozycja zamówienia | Produkt, ilość i snapshot cen z chwili złożenia zamówienia. |
| Rezerwacja | Zablokowanie ilości produktu dla zamówienia. Zarezerwowanych sztuk nie mogą kupić inni klienci. |
| Czas na płatność | Konfigurowalny okres od złożenia zamówienia, w którym klient musi zapłacić. |
| Limit prób płatności | Konfigurowalna maksymalna liczba nieudanych prób płatności. |
| Minimalna wartość zamówienia | Konfigurowalny próg sumy brutto pozycji, bez dostawy. |

## 3. Reguły biznesowe

### 3.1 Klient i koszyk
- R1. Zamówienie może złożyć wyłącznie zalogowany, zarejestrowany klient.
- R2. Zamówienie powstaje z bieżącej zawartości koszyka klienta.
- R3. Pustego koszyka nie można zamówić.
- R4. Po utworzeniu zamówienia koszyk jest od razu opróżniany. Po anulowaniu zamówienia koszyk się nie odtwarza.
- R5. Jeśli zamówienie zostanie odrzucone, koszyk pozostaje bez zmian.

### 3.2 Walidacja przed złożeniem
Złożenie zamówienia jest odrzucane w całości, gdy zachodzi którykolwiek z warunków:
- R6. Produkt z koszyka jest nieaktywny (wycofany ze sprzedaży).
- R7. Dostępna ilość produktu, czyli stan minus istniejące rezerwacje, jest mniejsza niż ilość w koszyku.
- R8. Suma brutto pozycji (bez dostawy) jest mniejsza niż minimalna wartość zamówienia.
- R9. Brak adresu dostawy lub metody dostawy.

Przy odrzuceniu z powodu R6 lub R7 klient dostaje listę **wszystkich** pozycji, których dotyczy problem, a nie tylko pierwszej.

### 3.3 Ceny
- R10. Obowiązuje cena z chwili składania zamówienia, a nie z chwili dodania produktu do koszyka.
- R10a. Klient składa zamówienie, potwierdzając widziane podsumowanie (pozycje, ceny, dostawa, suma). Jeśli w chwili składania którakolwiek kwota różni się od potwierdzonej, zamówienie nie powstaje, rezerwacje nie powstają, koszyk jest bez zmian, a klient dostaje aktualne podsumowanie do ponownego potwierdzenia.
- R11. Źródłem ceny produktu jest **jednostkowa cena netto w PLN** oraz **przypisana stawka VAT**.
- R12. Stawka VAT jest przypisana do produktu i nie zależy od kraju dostawy. Dopuszczalne stawki: 23%, 8%, 5%, 0%. Zwolnienie („zw.”) jest poza MVP.
- R13. Klientowi B2C prezentujemy cenę brutto.
- R14. Zamówienie przechowuje snapshot: cenę jednostkową netto, stawkę VAT, ilość, netto, VAT i brutto pozycji. Późniejsza zmiana ceny lub stawki produktu nie zmienia złożonego zamówienia.

### 3.4 Zasady obliczeń i zaokrągleń
Wszystkie kwoty są w PLN z dokładnością do 0,01 zł.
Zaokrąglanie: **połówki w górę** (0,005 → 0,01), stosowane tylko w miejscach wskazanych niżej.

Dla każdej pozycji zamówienia:
1. `netto_jedn` jest ceną źródłową z dokładnością do 0,01 (bez zaokrąglania).
2. `brutto_jedn = zaokrąglij(netto_jedn × (1 + stawka_VAT))`, czyli **jedyne zaokrąglenie w pozycji**. To cena prezentowana klientowi B2C.
3. `brutto_pozycji = brutto_jedn × ilość` (wynik dokładny).
4. `netto_pozycji = netto_jedn × ilość` (wynik dokładny).
5. `VAT_pozycji = brutto_pozycji − netto_pozycji`.

Gwarancja: klient zawsze widzi spójne kwoty (`brutto_jedn × ilość = brutto_pozycji`).
Konsekwencja zaakceptowana przez PO: `VAT_pozycji` może się różnić o grosze od `netto_pozycji × stawka_VAT` (patrz P5).

Dostawa liczona jest jak jedna pozycja z ilością 1.

Sumy zamówienia (bez dodatkowych zaokrągleń):
- `suma_netto = Σ netto_pozycji + netto_dostawy`
- `suma_VAT = Σ VAT_pozycji + VAT_dostawy`
- `suma_brutto = Σ brutto_pozycji + brutto_dostawy` (zawsze równa `suma_netto + suma_VAT`)
- Do sprawdzenia minimalnej wartości (R8) liczy się `Σ brutto_pozycji` bez dostawy.

Przykłady referencyjne:
| # | netto_jedn | VAT | ilość | brutto_jedn | brutto_poz. | netto_poz. | VAT_poz. |
|---|---|---|---|---|---|---|---|
| P1 | 8,13 | 23% | 3 | 10,00 (9,9999) | 30,00 | 24,39 | 5,61 |
| P2 | 2,50 | 23% | 1 | 3,08 (3,075 → połówka w górę) | 3,08 | 2,50 | 0,58 |
| P3 | 10,00 | 8% | 2 | 10,80 | 21,60 | 20,00 | 1,60 |
| P4 | 10,00 | 0% | 1 | 10,00 | 10,00 | 10,00 | 0,00 |
| P5 | 0,99 | 23% | 3 | 1,22 (1,2177) | 3,66 | 2,97 | 0,69 (netto × stawka = 0,6831 ≈ 0,68) |

### 3.5 Dostawa
- R15. Klient wybiera adres zapisany w profilu albo wpisuje nowy przy zamówieniu. Nowy adres trafia do profilu tylko wtedy, gdy klient tego zażąda.
- R16. Klient wybiera metodę dostawy. Każda metoda ma stałą cenę netto i przypisaną stawkę VAT, niezależne od zawartości zamówienia.
- R17. Adres i metoda dostawy z kosztem są zapisywane w zamówieniu jako snapshot.

### 3.6 Rezerwacja i współbieżność
- R18. Utworzenie zamówienia i rezerwacja wszystkich jego pozycji są **atomowe**: albo powstaje zamówienie i rezerwacje wszystkich pozycji, albo nic.
- R19. Po odrzuceniu nie zostaje żadna częściowa rezerwacja, a koszyk się nie zmienia.
- R20. Przy równoczesnych próbach zakupu tych samych ostatnich sztuk suma rezerwacji nigdy nie przekracza stanu magazynowego. Wygrywa próba, która pierwsza skutecznie zarezerwuje towar. Pozostałe są odrzucane jak przy braku towaru (R7).

### 3.7 Płatność i cykl życia zamówienia
Statusy:
- **Oczekuje na płatność**: stan po złożeniu, rezerwacje aktywne.
- **Opłacone**: po udanej płatności w czasie na płatność.
- **Anulowane**: po upływie czasu na płatność, wyczerpaniu limitu prób albo anulowaniu przez klienta (R27). Rezerwacje są zwalniane.

- R21. Płatność jest osobnym krokiem po złożeniu zamówienia.
- R22. Po nieudanej próbie płatności zamówienie dalej oczekuje na płatność, a rezerwacja trwa, o ile nie upłynął czas i nie wyczerpano limitu prób.
- R23. Po wyczerpaniu limitu prób zamówienie jest anulowane, a rezerwacja zwolniona.
- R24. Po upływie czasu na płatność zamówienie jest automatycznie anulowane, a rezerwacja zwolniona.
- R25. Czas na płatność i limit prób są konfigurowalne przez właściciela sklepu.
- R26. Anulowanego zamówienia nie można opłacić.
- R26a. Jeśli operator potwierdzi udaną płatność już po anulowaniu zamówienia, zamówienie pozostaje anulowane, płatność jest kierowana do zwrotu, a rezerwacje nie są odtwarzane.
- R27. Klient może sam anulować swoje zamówienie w statusie „Oczekuje na płatność”. Rezerwacje są wtedy od razu zwalniane, a koszyk się nie odtwarza.

### 3.8 Potwierdzenia
- R28. Każde zamówienie ma unikalny, czytelny dla klienta numer, zwracany po złożeniu.
- R29. Klient dostaje e-mail po złożeniu, opłaceniu i anulowaniu zamówienia (z podaniem przyczyny anulowania).

## 4. Kryteria akceptacji (Given / When / Then)

**AC1: Udane złożenie zamówienia**
Given zalogowany klient ma w koszyku aktywne, dostępne produkty o sumie brutto ≥ minimalnej wartości, podał adres i wybrał metodę dostawy
When składa zamówienie
Then powstaje zamówienie w statusie „Oczekuje na płatność”, przypisane do klienta
And wszystkie pozycje są zarezerwowane
And zamówienie zawiera snapshot cen pozycji, adresu i dostawy
And koszyk jest pusty.

**AC2: Niezalogowany użytkownik**
Given użytkownik nie jest zalogowany
When próbuje złożyć zamówienie
Then zamówienie nie powstaje.

**AC3: Pusty koszyk**
Given koszyk klienta jest pusty
When klient składa zamówienie
Then zamówienie nie powstaje, a klient dostaje informację o pustym koszyku.

**AC4: Brak towaru**
Given koszyk zawiera produkty A (dostępny) oraz B i C (dostępna ilość mniejsza niż w koszyku)
When klient składa zamówienie
Then zamówienie nie powstaje
And klient dostaje informację o pozycjach B i C
And nie powstaje żadna rezerwacja
And koszyk jest bez zmian.

**AC5: Produkt wycofany**
Given koszyk zawiera produkt, który został dezaktywowany
When klient składa zamówienie
Then zamówienie nie powstaje, klient dostaje informację o tym produkcie, a koszyk jest bez zmian.

**AC6: Minimalna wartość**
Given minimalna wartość wynosi 50,00 zł, a suma brutto pozycji wynosi 49,99 zł (z dostawą więcej)
When klient składa zamówienie
Then zamówienie nie powstaje, a klient dostaje informację o minimalnej wartości.
And przy sumie brutto pozycji równej 50,00 zł zamówienie powstaje.

**AC7: Aktualna cena**
Given produkt dodano do koszyka przy cenie netto 10,00 zł, cena zmieniła się na 12,00 zł, a klient widzi podsumowanie z ceną 12,00 zł
When klient potwierdza to podsumowanie i składa zamówienie
Then pozycja ma netto_jedn 12,00 zł.

**AC7a: Zmiana ceny po wyświetleniu podsumowania**
Given klient widzi podsumowanie z ceną netto 10,00 zł, a przed potwierdzeniem cena zmieniła się na 12,00 zł
When klient potwierdza podsumowanie
Then zamówienie nie powstaje, nie powstają rezerwacje, koszyk jest bez zmian
And klient dostaje aktualne podsumowanie z ceną 12,00 zł do ponownego potwierdzenia.

**AC8: Obliczenia i zaokrąglenia**
Given pozycje z przykładów P1–P5
When zamówienie zostaje złożone
Then netto, VAT i brutto każdej pozycji są równe wartościom z tabeli w 3.4
And suma_brutto = suma_netto + suma_VAT.

**AC9: Niezmienność snapshotu**
Given zamówienie zostało złożone
When zmienia się cena lub stawka VAT produktu albo koszt metody dostawy
Then kwoty w zamówieniu się nie zmieniają.

**AC10: Współbieżność ostatnich sztuk**
Given dostępna jest 1 sztuka produktu, a dwóch klientów ma ją w koszyku
When obaj jednocześnie składają zamówienie
Then dokładnie jedno zamówienie powstaje z rezerwacją
And drugi klient dostaje odmowę z powodu braku towaru, a jego koszyk jest bez zmian
And suma rezerwacji nie przekracza stanu.

**AC11: Atomowość przy wielu pozycjach**
Given koszyk zawiera A i B, a w trakcie składania inny klient rezerwuje ostatnią sztukę B
When składanie zamówienia się kończy
Then nie istnieje zamówienie ani rezerwacja A dla tego klienta.

**AC12: Udana płatność**
Given zamówienie oczekuje na płatność i czas nie upłynął
When płatność się powiedzie
Then zamówienie ma status „Opłacone”.

**AC13: Nieudana płatność z ponowieniem**
Given limit prób wynosi N, a klient ma za sobą mniej niż N−1 nieudanych prób
When kolejna próba się nie powiedzie
Then zamówienie dalej oczekuje na płatność, a rezerwacja jest aktywna.

**AC14: Wyczerpanie limitu prób**
Given limit prób wynosi N
When N-ta próba płatności się nie powiedzie
Then zamówienie jest anulowane, a rezerwacje zwolnione.

**AC15: Wygaśnięcie czasu na płatność**
Given zamówienie oczekuje na płatność
When upłynie skonfigurowany czas na płatność
Then zamówienie jest anulowane, rezerwacje zwolnione, a zwolnione sztuki znów są dostępne dla innych klientów.

**AC16: Płatność anulowanego zamówienia**
Given zamówienie jest anulowane
When klient próbuje je opłacić
Then płatność jest odrzucona.

**AC17: Anulowanie przez klienta**
Given zamówienie klienta oczekuje na płatność
When klient je anuluje
Then zamówienie ma status „Anulowane”, rezerwacje są zwolnione, a koszyk pozostaje pusty
And klient nie może anulować zamówienia opłaconego ani cudzego.

**AC18: Spóźnione potwierdzenie płatności**
Given zamówienie zostało anulowane (czas, limit prób lub decyzja klienta)
When operator potwierdza udaną płatność
Then zamówienie pozostaje anulowane, płatność jest kierowana do zwrotu, a rezerwacje nie są odtwarzane.

## 5. Rozstrzygnięte pytania otwarte
- ~~O1~~ Rozstrzygnięte: brutto pozycji = brutto_jedn × ilość, VAT = brutto − netto (3.4).
- ~~O2~~ Rozstrzygnięte: cena netto zawsze z dokładnością do 0,01 zł.
- ~~O3~~ Rozstrzygnięte: metoda dostawy ma cenę netto i przypisaną stawkę VAT, a obliczenia są jak dla pozycji z ilością 1.
- ~~O4~~ Rozstrzygnięte: stawki 23%, 8%, 5%, 0%; „zw.” poza MVP.
- ~~O5~~ Rozstrzygnięte: R20 potwierdzona.
- ~~O6~~ Rozstrzygnięte: nowy adres zapisujemy w profilu tylko na życzenie klienta (R15).
- ~~O7~~ Rozstrzygnięte: tak (R27, AC17).
- ~~O8~~ Rozstrzygnięte: unikalny, czytelny numer oraz e-maile (R28, R29).
- ~~O9~~ Rozstrzygnięte: spóźniona płatność idzie do zwrotu, a zamówienie pozostaje anulowane (R26a, AC18).
- ~~O10~~ Rozstrzygnięte: przy rozbieżności z potwierdzonym podsumowaniem odrzucamy zamówienie i pokazujemy aktualne podsumowanie (R10a, AC7a).

Wszystkie pytania otwarte zostały rozstrzygnięte. Specyfikacja zaakceptowana przez PO (2026-10-24).
