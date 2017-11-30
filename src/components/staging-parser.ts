import { JiraApiIssue, Workflow } from '../types';

const addCreatedToFirstStage = (issue: JiraApiIssue, stageBins: string[][]) => {
  const creationDate: string = issue.fields['created'];
  stageBins[0].push(creationDate);
  return stageBins;
};

const addResolutionDateToClosedStage = (issue: JiraApiIssue, stageMap, stageBins) => {
  if (issue.fields['status'] !== undefined || issue.fields['status'] != null) {
    if (issue.fields['status'].name === 'Closed') {
      if (issue.fields['resolutiondate'] !== undefined || issue.fields['resolutiondate'] != null) {
        const resolutionDate: string = issue.fields['resolutiondate'];
        const doneStageIndex: number = stageMap.get('Closed');
        stageBins[doneStageIndex].push(resolutionDate);
      }
    }
  }
  return stageBins;
};

const populateStages = (issue: JiraApiIssue, stageMap, stageBins, unusedStages = new Map<string, number>()) => {
  // sort status changes into stage bins
  issue.changelog.histories.forEach(history => {
    history.items.forEach(historyItem => {
      if (historyItem['field'] === 'status') {
        const stageName: string = historyItem.toString;
        if (stageMap.has(stageName)) {
          const stageIndex: number = stageMap.get(stageName);
          const stageDate: string = history['created'];
          stageBins[stageIndex].push(stageDate);
        } else {
          const count: number = unusedStages.has(stageName) ? unusedStages.get(stageName) : 0;
          unusedStages.set(stageName, count + 1);
        }
      }
      // naive solution, does not differentiate between epic status stage or status stage/
      //  (lumpsthem together);
      const customAttributes = ['Epic Status'];
      if (customAttributes.includes(historyItem['field']) && historyItem['fieldtype'] === 'custom') {
        const stageName: string = historyItem.toString;
        if (stageMap.has(stageName)) {
          const stageIndex: number = stageMap.get(stageName);
          const stageDate: string = history['created'];
          stageBins[stageIndex].push(stageDate);
        } else {
          const count: number = unusedStages.has(stageName) ? unusedStages.get(stageName) : 0;
          unusedStages.set(stageName, count + 1);
        }
      }
    });
  });
  return stageBins;
};

const filterAndFlattenStagingDates = (stageBins: string[][]) => {
  let latestValidIssueDateSoFar: string = '';
  const lastIdx = stageBins.length - 1;

  const stagingDates = stageBins.map((stageBin: string[], idx: number) => {
    let validStageDates: string[] = stageBin.filter(date => {
      // All dates are ISO 8601, so string comparison is fine
      return date >= latestValidIssueDateSoFar;
    });
    if (validStageDates.length) {
      validStageDates.sort();
      // Prefer earliest valid date except in the last stage
      if(idx < lastIdx && idx != 0){
        const earliestStageDate = latestValidIssueDateSoFar = validStageDates[0];
        return earliestStageDate.split('T')[0];
      } else {
        const latestStageDate = latestValidIssueDateSoFar = validStageDates[validStageDates.length - 1];
        return latestStageDate.split('T')[0];
      }
    } else {
      return '';
    }
  });
  return stagingDates;
};

const getStagingDates = (issue: JiraApiIssue, workflow: Workflow): string[] => {
  const createInFirstStage = workflow[Object.keys(workflow)[0]].includes('(Created)');
  const resolvedInLastStage = workflow[Object.keys(workflow)[Object.keys(workflow).length - 1]].includes('(Resolved)');

  const stages = Object.keys(workflow);
  const stageMap = stages.reduce((map: Map<string, number>, stage: string, i: number) => {
    return workflow[stage].reduce((map: Map<string, number>, stageAlias: string) => {
      return map.set(stageAlias, i);
    }, map);
  }, new Map<string, number>());

  let stageBins: string[][] = stages.map(() => []); // todo, we dont need stages variable....just create array;

  if (createInFirstStage) {
    stageBins = addCreatedToFirstStage(issue, stageBins);
  }
  if (resolvedInLastStage) {
    stageBins = addResolutionDateToClosedStage(issue, stageMap, stageBins);
  }
  stageBins = populateStages(issue, stageMap, stageBins);
  const stagingDates = filterAndFlattenStagingDates(stageBins);
  return stagingDates;
};

export {
  getStagingDates,
};